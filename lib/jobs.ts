import { randomUUID } from "node:crypto";
import { env } from "./env";
import { getStore, type Job, type JobMode } from "./store";
import { addEntry, batchPrompt, BREAKING_MARK, bumpNote, changelogPrompt, isBreaking, cutRelease, parsePrCommand, parseReleaseCommand, type PrCommand, releasePrompt, tagsFromPush, unreleased, type PrInfo, type QueuedEntry } from "./changelog";
import { draftAudienceNote, draftEntry, draftSummary } from "./llm";
import { getRun, launchAgent } from "./cursor";
import { open, parseMasterKey } from "./crypto";
import { commentOnPr, getInstallationInfo, getRepoFile, listPrComments, originConfigured, repoPermission } from "./origin";
import { CONFIG_PATH, DEFAULT_CONFIG, excludedBy, notesEnabled, parseConfig, sectionFor, type ShiplogConfig } from "./config";
import { formatAudienceNotesBlock, notesStorageKey, releaseNotesInstructions, type AudienceNotes } from "./notes";

export interface Envelope {
  deliveryId?: string; installationId: string;
  event: { id?: string; type: string; payload: any };
}

/**
 * Only the installer, or a user with write/admin on the repo, may run `/shiplog` commands. `release` (it can launch an agent
 * billed to the key owner). Apps and service accounts commenting on their own are refused.
 */
export async function canRelease(installationId: string, repo: string, author: any): Promise<boolean> {
  const userId: string | undefined = author?.user?.id;
  if (!userId || author?.app || author?.serviceAccount || author?.user?.performedVia?.app) return false;
  const store = getStore();
  const inst = await store.getInstallation(installationId);
  let installerId = inst?.installerId ?? null;
  if (installerId && installerId === userId) return true;
  if (!originConfigured()) return false;
  if (!installerId) {
    try {
      const info = await getInstallationInfo(installationId);
      installerId = info.installerId;
      if (inst) await store.upsertInstallation({ ...inst, installerId, namespace: inst.namespace || info.namespace, namespaceType: info.namespaceType });
    } catch (e) { console.error("[shiplog] installation lookup failed:", (e as Error).message); }
  }
  if (installerId && installerId === userId) return true;
  const perm = await repoPermission(installationId, repo, userId).catch(() => null);
  return perm === "write" || perm === "admin";
}

const today = () => new Date().toISOString().slice(0, 10);

/** Post a PR comment via Origin, or record it in the outbox when Origin creds aren't configured (local/demo). Always recorded. */
async function postComment(installationId: string, repo: string, prNumber: string, body: string) {
  let delivered = false;
  if (originConfigured() && prNumber) {
    try { await commentOnPr(installationId, repo, prNumber, body); delivered = true; }
    catch (e) { console.error("[shiplog] comment failed:", (e as Error).message); }
  }
  await getStore().putOutbox({ id: randomUUID(), installationId, repo, prNumber, body, delivered, createdAt: new Date().toISOString() });
}

async function userKey(installationId: string): Promise<string | null> {
  if (!env.byokEnabled || !env.encKey) return null;
  const k = await getStore().getKey(installationId);
  if (!k) return null;
  return open(k, parseMasterKey(env.encKey), installationId);
}

/** Decide how to fulfil a job: neon test mode → user's Cursor key → no-key fallback prompt. */
export async function pickMode(installationId: string): Promise<{ mode: JobMode; key?: string }> {
  if (env.llmProvider === "neon") return { mode: "neon" };
  const key = await userKey(installationId);
  return key ? { mode: "cursor", key } : { mode: "fallback" };
}

/** The repo's .shiplog.yml, or defaults when Origin is not configured or the file is missing. */
async function loadConfig(installationId: string, repo: string): Promise<ShiplogConfig> {
  if (!originConfigured()) return DEFAULT_CONFIG;
  try { return parseConfig(await getRepoFile(installationId, repo, CONFIG_PATH)); }
  catch (e) { console.error("[shiplog] config load failed:", (e as Error).message); return DEFAULT_CONFIG; }
}

const isOwnComment = (text: string) => text.trimStart().startsWith("**Shiplog**");

/** The latest `/shiplog skip` or `/shiplog entry` on the PR from someone allowed to run it. */
async function latestPrCommand(installationId: string, repo: string, prNumber: string): Promise<PrCommand | null> {
  if (!originConfigured() || !prNumber) return null;
  const comments = await listPrComments(installationId, repo, prNumber).catch((e) => { console.error("[shiplog] comments failed:", (e as Error).message); return []; });
  for (const c of comments.reverse()) {
    const cmd = isOwnComment(c.body ?? "") ? null : parsePrCommand(c.body ?? "");
    if (cmd && (await canRelease(installationId, repo, c.author))) return cmd;
  }
  return null;
}

/** Suggested semver bump for a release, from the stored changelog (neon) or the repo's changelog file (agent and prompt). */
function releaseNoteExtras(cfg: ShiplogConfig, version: string): string | undefined {
  if (!notesEnabled(cfg)) return undefined;
  return releaseNotesInstructions(version, cfg.notes.audiences, cfg.notes.languages);
}

async function draftStoredAudienceNotes(cfg: ShiplogConfig, version: string, unreleasedMd: string): Promise<AudienceNotes> {
  const bundle: AudienceNotes = {};
  for (const audience of cfg.notes.audiences) {
    bundle[audience] = {};
    for (const lang of cfg.notes.languages) {
      bundle[audience]![lang] = await draftAudienceNote(version, unreleasedMd, audience, lang);
    }
  }
  return bundle;
}

/** Suggested semver bump for a release, from the stored changelog (neon) or the repo's changelog file (agent and prompt). */
async function releaseBumpNote(installationId: string, repo: string, version: string, mode: JobMode, path: string): Promise<string | null> {
  if (mode === "neon") return bumpNote(await getStore().getChangelog(repo), version);
  if (!originConfigured()) return null;
  const md = await getRepoFile(installationId, repo, path).catch(() => null);
  return bumpNote(md, version);
}

// pull_request.comment.created carries the repo only under pullRequest.repository.
const repoOf = (p: any): string => {
  const r = p?.repository ?? p?.pullRequest?.repository;
  return r?.owner?.slug && r?.name ? `${r.owner.slug}/${r.name}` : (r?.fullName ?? "unknown/unknown");
};
const repoUrl = (repo: string) => `https://cursor.com/codebase/${repo}`;

export async function handleEvent(env_: Envelope, deliveryId: string): Promise<Job | null> {
  const store = getStore();
  const { type, payload } = env_.event;
  const instId = env_.installationId;
  if (type === "ping" || !instId) return null; // pings belong to no installation
  const now = new Date().toISOString();

  if (type === "installation.created" || type === "installation.unsuspended" || type === "installation.updated") {
    await store.upsertInstallation({ id: instId, namespace: payload?.installation?.account?.slug ?? payload?.installation?.namespace?.slug ?? "", status: "active", createdAt: now, disconnectedAt: null });
    return null;
  }
  if (type === "installation.suspended") {
    const i = await store.getInstallation(instId);
    await store.upsertInstallation({ ...(i ?? { id: instId, namespace: "", createdAt: now }), status: "suspended" });
    return null;
  }
  if (type === "installation.deleted") {
    const i = await store.getInstallation(instId);
    await store.upsertInstallation({ ...(i ?? { id: instId, namespace: "", createdAt: now }), status: "disconnected", disconnectedAt: now });
    await store.deleteKey(instId);
    return null;
  }

  const inst = await store.getInstallation(instId);
  if (inst && inst.status !== "active") return null; // disconnected/suspended: ignore webhooks
  if (!inst) await store.upsertInstallation({ id: instId, namespace: payload?.repository?.owner?.slug ?? "", status: "active", createdAt: now });

  const repo = repoOf(payload);
  const pr = payload?.pullRequest;
  let kind: Job["kind"] | null = null;
  let version: string | null = null;
  if (type === "pull_request.merged" && pr) kind = "changelog";
  if (type === "repository.pushed") {
    // Tag → release notes. Native Origin repos only (no repository.pushed for GitHub mirrors).
    version = tagsFromPush(payload)[0] ?? null;
    if (version) kind = "release";
  }
  if (type === "pull_request.comment.created") {
    const text: string = payload?.comment?.body ?? "";
    // Never react to Shiplog's own comments (avoids reply loops).
    if (isOwnComment(text)) return null;
    version = parseReleaseCommand(text);
    const cmd = version ? null : parsePrCommand(text);
    const n = String(payload?.pullRequest?.number ?? "");
    if ((version || cmd) && !(await canRelease(instId, repo, payload?.comment?.author))) {
      await postComment(instId, repo, n, `**Shiplog**: \`/shiplog ${version ? "release" : cmd!.kind}\` can only be run by the person who installed Shiplog or by someone with write or admin access to this repository.`);
      return null;
    }
    if (cmd) {
      // Applied at merge time, read back from the PR's comments, so nothing is stored here.
      await postComment(instId, repo, n, cmd.kind === "skip"
        ? `**Shiplog** will skip the changelog for this PR when it merges.`
        : `**Shiplog** will use this changelog entry when the PR merges: "${cmd.text}"`);
      return null;
    }
    if (version) kind = "release";
  }
  if (!kind) return null;
  if (repo === "unknown/unknown") { console.error(`[shiplog] ${type}: no repository in payload`); return null; }

  const prNumber = String(pr?.number ?? payload?.pullRequest?.number ?? "");
  const info: PrInfo = { repo, number: prNumber, title: pr?.title ?? "", body: pr?.body ?? "", url: pr?.webUrl ?? (prNumber ? `${repoUrl(repo)}/pull/${prNumber}` : repoUrl(repo)) };
  const cfg = await loadConfig(instId, repo);
  const picked = await pickMode(instId);
  const { mode, key } = cfg.mode === "prompt" && picked.mode === "cursor" ? { mode: "fallback" as const, key: undefined } : picked;
  const job: Job = { id: randomUUID(), deliveryId, installationId: instId, repo, prNumber, prUrl: info.url, kind, mode, status: "running", createdAt: now };
  const cmd = kind === "changelog" ? await latestPrCommand(instId, repo, prNumber) : null;
  const skip = kind !== "changelog" ? null : cmd?.kind === "skip" ? "/shiplog skip" : excludedBy(pr, cfg);
  const entry = cmd?.kind === "entry" ? cmd.text : undefined;
  if (skip) { job.status = "ignored"; job.result = `excluded by ${skip}`; await store.putJob(job); return job; }
  await store.putJob(job);

  try {
    if (kind === "changelog") {
      const hint = sectionFor(info.title, cfg);
      if (mode === "neon") {
        const drafted = entry ? { section: hint ?? "Changed", bullet: `${entry} (#${prNumber})` } : await draftEntry(info, hint, undefined, cfg);
        const { section } = drafted;
        const bullet = isBreaking(info.title, info.body) ? BREAKING_MARK + drafted.bullet : drafted.bullet;
        const md = addEntry(await store.getChangelog(repo), section, bullet);
        await store.putChangelog(repo, md);
        job.result = `### ${section}\n- ${bullet}`;
        await postComment(instId, repo, prNumber, `**Shiplog** drafted a changelog entry for this PR:\n\n\`\`\`md\n## [Unreleased]\n\n${job.result}\n\`\`\`\n\n<sub>Test mode (direct model draft). Comment \`/shiplog release vX.Y.Z\` to cut release notes.</sub>`);
      } else if (mode === "cursor" && cfg.batch !== "off") {
        const q: QueuedEntry & { batch: string } = { number: prNumber, url: info.url, title: info.title, body: info.body.slice(0, 1000), section: hint, entry, breaking: isBreaking(info.title, info.body), batch: cfg.batch };
        job.status = "queued"; job.result = JSON.stringify(q);
        await postComment(instId, repo, prNumber, `**Shiplog** queued this PR for the next ${cfg.batch === "daily" ? "daily" : "release"} batch. One agent run will cover every queued PR.`);
      } else if (mode === "cursor") {
        const l = await launchAgent(key!, changelogPrompt(info, hint, cfg, entry), repoUrl(repo));
        job.agentId = l.agentId; job.runId = l.runId; job.result = `agent ${l.agentId}`;
        await postComment(instId, repo, prNumber, `**Shiplog** is drafting the changelog entry with a Cursor cloud agent on your plan. A PR updating \`${cfg.changelogPath}\` will follow.`);
      } else {
        job.result = changelogPrompt(info, hint, cfg, entry);
        await postComment(instId, repo, prNumber, fallbackComment(info, job.result));
      }
    } else {
      const v = version!;
      const note = await releaseBumpNote(instId, repo, v, mode, cfg.changelogPath);
      const withNote = (body: string) => (note ? `${body}\n\n${note}` : body);
      if (mode === "neon") {
        const before = await store.getChangelog(repo);
        const notes = unreleased(before);
        const summary = notes ? await draftSummary(v, notes) : "Maintenance release.";
        const md = cutRelease(before, v, today(), summary);
        await store.putChangelog(repo, md);
        job.result = `## [${v.replace(/^v/, "")}] - ${today()}\n\n${summary}\n\n${notes}`;
        let audienceBlock = "";
        if (notesEnabled(cfg) && notes) {
          const bundle = await draftStoredAudienceNotes(cfg, v, notes);
          await store.putChangelog(notesStorageKey(repo, v), JSON.stringify(bundle, null, 2));
          audienceBlock = `\n\n${formatAudienceNotesBlock(v, bundle)}`;
        }
        await postComment(instId, repo, prNumber, withNote(`**Shiplog** release notes for **${v}**:\n\n\`\`\`md\n${job.result}\n\`\`\`${audienceBlock}`));
      } else if (mode === "cursor") {
        const queued = await queuedFor(instId, repo);
        const extra = releaseNoteExtras(cfg, v);
        const prompt = queued.length ? batchPrompt(repo, queued.map(entryOf), cfg, { version: v, date: today() }, extra) : releasePrompt(repo, v, today(), cfg, extra);
        const l = await launchAgent(key!, prompt, repoUrl(repo));
        job.agentId = l.agentId; job.runId = l.runId; job.result = `agent ${l.agentId}${queued.length ? ` (${queued.length} queued PRs)` : ""}`;
        await markBatched(queued, job.id);
        await postComment(instId, repo, prNumber, withNote(`**Shiplog** is cutting **${v}** with a Cursor cloud agent. A release PR will follow.`));
      } else {
        job.result = releasePrompt(repo, v, today(), cfg, releaseNoteExtras(cfg, v));
        await postComment(instId, repo, prNumber, withNote(fallbackComment(info, job.result, v)));
      }
    }
    if (job.status !== "queued") job.status = mode === "cursor" ? "running" : "done";
  } catch (e) {
    job.status = "failed";
    job.result = (e as Error).message;
  }
  await store.putJob(job);
  return job;
}

const entryOf = (j: Job): QueuedEntry => JSON.parse(j.result ?? "{}");
const batchOf = (j: Job): string => { try { return JSON.parse(j.result ?? "{}").batch ?? ""; } catch { return ""; } };

async function queuedFor(installationId: string, repo: string): Promise<Job[]> {
  return (await getStore().listJobs(installationId)).filter((j) => j.status === "queued" && j.repo === repo).reverse();
}
async function markBatched(queued: Job[], batchJobId: string) {
  for (const j of queued) { j.status = "done"; j.result = `batched into ${batchJobId}`; await getStore().putJob(j); }
}

/** Daily batches (cron): one agent per repo for every PR queued with `batch: daily`. Returns agents launched. */
export async function flushBatches(): Promise<number> {
  const store = getStore();
  const groups = new Map<string, Job[]>();
  for (const j of (await store.listJobs()).filter((j) => j.status === "queued" && batchOf(j) === "daily").reverse()) {
    const k = `${j.installationId} ${j.repo}`;
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  let launched = 0;
  for (const queued of groups.values()) {
    const { installationId, repo } = queued[0];
    try {
      const key = await userKey(installationId);
      if (!key) continue;
      const cfg = await loadConfig(installationId, repo);
      const l = await launchAgent(key, batchPrompt(repo, queued.map(entryOf), cfg), repoUrl(repo));
      const job: Job = { id: randomUUID(), deliveryId: `batch-${randomUUID()}`, installationId, repo, prNumber: "", prUrl: repoUrl(repo), kind: "changelog", mode: "cursor", status: "running", agentId: l.agentId, runId: l.runId, result: `agent ${l.agentId} (${queued.length} queued PRs)`, createdAt: new Date().toISOString() };
      await store.putJob(job);
      await markBatched(queued, job.id);
      launched++;
    } catch (e) { console.error("[shiplog] batch flush failed:", (e as Error).message); }
  }
  return launched;
}

/** Cursor agent runs billed to the installation's key. */
export function agentRunStats(jobs: Job[], now: Date): { last30Days: number; total: number } {
  const runs = jobs.filter((j) => j.mode === "cursor" && j.agentId);
  const since = now.getTime() - 30 * 24 * 3600 * 1000;
  return { last30Days: runs.filter((j) => Date.parse(j.createdAt) >= since).length, total: runs.length };
}

export function fallbackComment(info: PrInfo, prompt: string, version?: string) {
  return [
    `**Shiplog** — no Cursor key connected, so here is a ready-to-run prompt${version ? ` for release ${version}` : ""}.`,
    `Paste it into a Cursor agent (Cmd/Ctrl+I or cursor.com/agents) on this repo:`,
    "",
    "```text",
    prompt,
    "```",
    "",
    `<sub>Connect a key on the Shiplog setup page to have this done automatically. PR: ${info.url}</sub>`,
  ].join("\n");
}

const TERMINAL = new Set(["FINISHED", "ERROR", "FAILED", "CANCELLED", "EXPIRED"]);

/** Poll running Cursor agent jobs; when the agent's PR appears (run.git.branches[].prUrl), announce it on the source PR. */
export async function pollAgents(): Promise<number> {
  const store = getStore();
  let updated = 0;
  for (const job of (await store.listJobs()).filter((j) => j.mode === "cursor" && j.status === "running" && j.agentId && j.runId)) {
    try {
      const key = await userKey(job.installationId);
      if (!key) { job.status = "failed"; job.result = "key removed"; await store.putJob(job); continue; }
      const run = await getRun(key, job.agentId!, job.runId!);
      if (run.prUrl || TERMINAL.has(run.status)) {
        job.prOpened = run.prUrl;
        job.status = run.prUrl ? "done" : "failed";
        job.result = run.prUrl ? `PR ${run.prUrl}` : `agent ${run.status}`;
        await store.putJob(job); updated++;
        if (run.prUrl) await postComment(job.installationId, job.repo, job.prNumber, `**Shiplog** opened ${run.prUrl} updating \`CHANGELOG.md\`.`);
      }
    } catch (e) { console.error("[shiplog] poll error:", (e as Error).message); }
  }
  return updated;
}
