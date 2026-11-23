import { randomUUID } from "node:crypto";
import { env } from "./env";
import { getStore, type Job, type JobMode } from "./store";
import { addEntry, batchPrompt, BREAKING_MARK, bumpNote, changelogPrompt, isBreaking, cutRelease, multiChangelogPrompt, multiReleasePrompt, neonChangelogKey, parsePrCommand, parseReleaseCommand, type PrCommand, releasePrompt, tagsFromPush, unreleased, type PrInfo, type QueuedEntry } from "./changelog";
import { draftAudienceNote, draftEntry, draftSummary } from "./llm";
import { getRun, launchAgent } from "./cursor";
import { open, parseMasterKey } from "./crypto";
import {
  commentOnPr,
  getInstallationInfo,
  getRepoFile,
  installProvider,
  listPrComments,
  listPrFiles,
  repoPermission,
  vcsConfigured,
} from "./vcs";
import { groupBotEntries, isBotAuthor, leftOutBlock, skippedSince } from "./release-preview";
import { DEFAULT_CONFIG, excludedBy, notesEnabled, sectionFor, type ShiplogConfig } from "./config";
import { loadRepoConfig } from "./repo-config";
import { allChangelogPaths, changelogTargets } from "./packages";
import { mergeNotifyWebhooks, notifyWebhooks, type NotifyPayload } from "./notify";
import { formatAudienceNotesBlock, notesStorageKey, releaseNotesInstructions, type AudienceNotes } from "./notes";
import { backfillInstallation, maybeBackfillOnFirstVisit } from "./backfill";
import { trackInstallationCreated, trackInstallationDeleted, trackAgentAnnouncement, trackJobCompletion } from "./analytics/track";
import { persistChangelog } from "./changelog-invalidate";

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
  if (!userId || author?.app || author?.serviceAccount || author?.user?.performedVia?.app || author?.user?.type === "Bot") return false;
  const store = getStore();
  const inst = await store.getInstallation(installationId);
  const provider = inst?.provider ?? "origin";
  let installerId = inst?.installerId ?? null;
  if (installerId && installerId === userId) return true;
  if (!vcsConfigured(provider)) return false;
  if (!installerId) {
    try {
      const info = await getInstallationInfo(installationId, provider);
      installerId = info.installerId;
      if (inst) await store.upsertInstallation({ ...inst, installerId, namespace: inst.namespace || info.namespace, namespaceType: info.namespaceType });
    } catch (e) { console.error("[shiplog] installation lookup failed:", (e as Error).message); }
  }
  if (installerId && installerId === userId) return true;
  const login: string | undefined = author?.user?.login;
  const perm = await repoPermission(installationId, repo, userId, login).catch(() => null);
  return perm === "write" || perm === "admin";
}

const today = () => new Date().toISOString().slice(0, 10);

/** Post a PR comment via Origin, or record it in the outbox when Origin creds aren't configured (local/demo). Always recorded. */
async function postComment(installationId: string, repo: string, prNumber: string, body: string) {
  let delivered = false;
  const provider = await installProvider(installationId);
  if (vcsConfigured(provider) && prNumber) {
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

/** User webhooks must never block changelog or release work. */
function fireUserNotify(installationId: string, cfg: ShiplogConfig, payload: NotifyPayload) {
  void (async () => {
    const inst = await getStore().getInstallation(installationId);
    const urls = mergeNotifyWebhooks(inst?.notifyWebhooks, cfg.notify.webhooks);
    if (!urls.length) return;
    await notifyWebhooks(urls, payload);
  })().catch((e) => console.error("[shiplog] notify error:", (e as Error).message));
}

const isOwnComment = (text: string) => text.trimStart().startsWith("**Shiplog**");

/** The latest `/shiplog skip` or `/shiplog entry` on the PR from someone allowed to run it. */
async function latestPrCommand(installationId: string, repo: string, prNumber: string): Promise<PrCommand | null> {
  const provider = await installProvider(installationId);
  if (!vcsConfigured(provider) || !prNumber) return null;
  const comments = await listPrComments(installationId, repo, prNumber).catch((e) => { console.error("[shiplog] comments failed:", (e as Error).message); return []; });
  for (const c of comments.reverse()) {
    const cmd = isOwnComment(c.body ?? "") ? null : parsePrCommand(c.body ?? "");
    if (cmd && (await canRelease(installationId, repo, c.author))) return cmd;
  }
  return null;
}

/** Extra agent instructions for audience release notes. */
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

const styleOf = (cfg: ShiplogConfig, changelogPath: string) => ({ changelogPath, language: cfg.language, tone: cfg.tone });

/** Changed file paths for a merged PR (Origin List Pull Request Files). Falls back to [] without Origin. */
async function mergedPrFiles(installationId: string, repo: string, prNumber: string): Promise<string[]> {
  const provider = await installProvider(installationId);
  if (!vcsConfigured(provider) || !prNumber) return [];
  try { return await listPrFiles(installationId, repo, prNumber); }
  catch (e) { console.error("[shiplog] pr files failed:", (e as Error).message); return []; }
}

/** Which changelog files a merged PR should update. */
async function targetsForPr(installationId: string, repo: string, prNumber: string, cfg: ShiplogConfig): Promise<string[]> {
  if (!cfg.packages.length) return [cfg.changelogPath];
  const files = await mergedPrFiles(installationId, repo, prNumber);
  if (!files.length) return [cfg.changelogPath];
  return changelogTargets(files, cfg);
}

function changelogEntryPrompt(info: PrInfo, hint: ReturnType<typeof sectionFor>, cfg: ShiplogConfig, paths: string[], entry?: string) {
  if (paths.length === 1) return changelogPrompt(info, hint, styleOf(cfg, paths[0]), entry);
  return multiChangelogPrompt(info, hint, styleOf(cfg, paths[0]), paths, entry);
}

/** Suggested semver bumps for a release (one line per changelog when monorepo packages are set). */
async function releaseBumpNotes(installationId: string, repo: string, version: string, mode: JobMode, cfg: ShiplogConfig): Promise<string | null> {
  const paths = allChangelogPaths(cfg);
  const lines: string[] = [];
  const store = getStore();
  for (const path of paths) {
    let note: string | null;
    if (mode === "neon") note = bumpNote(await store.getChangelog(neonChangelogKey(repo, path)), version);
    else if (!vcsConfigured(await installProvider(installationId))) continue;
    else note = bumpNote(await getRepoFile(installationId, repo, path).catch(() => null), version);
    if (note) lines.push(cfg.packages.length > 1 ? `**${path}** — ${note}` : note);
  }
  return lines.length ? lines.join("\n\n") : null;
}

function releaseAgentPrompt(repo: string, version: string, cfg: ShiplogConfig, extra?: string) {
  const paths = allChangelogPaths(cfg);
  const style = styleOf(cfg, paths[0]);
  if (paths.length === 1) return releasePrompt(repo, version, today(), style, extra);
  const p = multiReleasePrompt(repo, version, today(), style, paths);
  return extra ? `${p}\n${extra}\nYou may also create the audience note files listed above.` : p;
}

/** Queued PRs in one prompt, one batch section per changelog file. With a version, the same run cuts the release. */
function batchReleasePrompt(repo: string, queued: Job[], cfg: ShiplogConfig, version?: string, extra?: string) {
  const byPath = new Map<string, QueuedEntry[]>();
  for (const j of queued) {
    const e = entryOf(j);
    const paths = e.changelogPaths?.length ? e.changelogPaths : [cfg.changelogPath];
    for (const path of paths) byPath.set(path, [...(byPath.get(path) ?? []), e]);
  }
  const date = today();
  const parts = [...byPath.entries()].map(([path, entries]) => batchPrompt(repo, entries, styleOf(cfg, path), version ? { version, date } : undefined, extra, path, { groupBots: cfg.groupBots }));
  return parts.length === 1 ? parts[0] : parts.join("\n\n---\n\n");
}

const pathsLabel = (paths: string[]) => (paths.length === 1 ? `\`${paths[0]}\`` : `${paths.length} changelog files (\`${paths.join("`, `")}\`)`);

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
    const prev = await store.getInstallation(instId);
    await store.upsertInstallation({
      ...(prev ?? { id: instId, namespace: "", createdAt: now }),
      id: instId,
      provider: prev?.provider ?? "origin",
      namespace: payload?.installation?.account?.slug ?? payload?.installation?.namespace?.slug ?? prev?.namespace ?? "",
      status: "active",
      createdAt: prev?.createdAt ?? now,
      disconnectedAt: null,
    });
    if (type === "installation.created") {
      await backfillInstallation(instId).catch((e) => console.error("[shiplog] install history backfill:", (e as Error).message));
      await trackInstallationCreated(prev?.provider ?? "origin", instId);
    }
    return null;
  }
  if (type === "installation.suspended") {
    const i = await store.getInstallation(instId);
    await store.upsertInstallation({ ...(i ?? { id: instId, namespace: "", createdAt: now, provider: "origin" }), status: "suspended" });
    return null;
  }
  if (type === "installation.deleted") {
    const i = await store.getInstallation(instId);
    await store.upsertInstallation({ ...(i ?? { id: instId, namespace: "", createdAt: now, provider: "origin" }), status: "disconnected", disconnectedAt: now });
    await store.deleteKey(instId);
    await trackInstallationDeleted(i?.provider ?? "origin", instId);
    return null;
  }

  const inst = await store.getInstallation(instId);
  if (inst && inst.status !== "active") return null; // disconnected/suspended: ignore webhooks
  if (!inst) {
    await store.upsertInstallation({
      id: instId,
      provider: "origin",
      namespace: payload?.repository?.owner?.slug ?? "",
      status: "active",
      createdAt: now,
    });
  }

  const repo = repoOf(payload);
  if (repo !== "unknown/unknown") await maybeBackfillOnFirstVisit(instId, repo);
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
  const cfg = await loadRepoConfig(instId, repo);
  const picked = await pickMode(instId);
  const { mode, key } = cfg.mode === "prompt" && picked.mode === "cursor" ? { mode: "fallback" as const, key: undefined } : picked;
  const job: Job = { id: randomUUID(), deliveryId, installationId: instId, repo, prNumber, prUrl: info.url, kind, mode, status: "running", createdAt: now };
  const cmd = kind === "changelog" ? await latestPrCommand(instId, repo, prNumber) : null;
  const excluded = kind === "changelog" ? excludedBy(pr, cfg) : null;
  // An explicit `/shiplog entry` overrides `skip_types`, never labels or authors.
  const skip = kind !== "changelog" ? null : cmd?.kind === "skip" ? "/shiplog skip" : cmd?.kind === "entry" && excluded?.startsWith("type ") ? null : excluded;
  const entry = cmd?.kind === "entry" ? cmd.text : undefined;
  if (skip) { job.status = "ignored"; job.result = `excluded by ${skip}`; await store.putJob(job); return job; }
  const changelogPaths = kind === "changelog" ? await targetsForPr(instId, repo, prNumber, cfg) : undefined;
  if (kind === "changelog" && cfg.packages.length && !changelogPaths!.length) {
    job.status = "ignored"; job.result = "no matching package paths"; await store.putJob(job); return job;
  }
  if (changelogPaths?.length) job.changelogPaths = changelogPaths;
  await store.putJob(job);

  try {
    if (kind === "changelog") {
      const paths = changelogPaths!;
      const hint = sectionFor(info.title, cfg);
      if (mode === "neon") {
        const drafted = entry ? { section: hint ?? "Changed", bullet: `${entry} (#${prNumber})` } : await draftEntry(info, hint, undefined, cfg);
        const { section } = drafted;
        const bullet = isBreaking(info.title, info.body) ? BREAKING_MARK + drafted.bullet : drafted.bullet;
        const blocks: string[] = [];
        for (const path of paths) {
          const key = neonChangelogKey(repo, path);
          const md = addEntry(await store.getChangelog(key), section, bullet);
          await persistChangelog(store, key, md);
          blocks.push(`<!-- ${path} -->\n### ${section}\n- ${bullet}`);
        }
        job.result = blocks.join("\n\n");
        await postComment(instId, repo, prNumber, `**Shiplog** drafted a changelog entry for this PR:\n\n\`\`\`md\n## [Unreleased]\n\n${job.result}\n\`\`\`\n\n<sub>Test mode (direct model draft). Comment \`/shiplog release vX.Y.Z\` to cut release notes.</sub>`);
        fireUserNotify(instId, cfg, { event: "changelog_entry", repo, prNumber, prUrl: info.url, title: info.title, detail: job.result });
      } else if (mode === "cursor" && cfg.batch !== "off") {
        const q: QueuedEntry & { batch: string } = { number: prNumber, url: info.url, title: info.title, body: info.body.slice(0, 1000), section: hint, entry, breaking: isBreaking(info.title, info.body), changelogPaths: paths, batch: cfg.batch, ...(isBotAuthor(pr?.author) ? { bot: true } : {}) };
        job.status = "queued"; job.result = JSON.stringify(q);
        await postComment(instId, repo, prNumber, `**Shiplog** queued this PR for the next ${cfg.batch === "daily" ? "daily" : "release"} batch. One agent run will cover every queued PR.`);
      } else if (mode === "cursor") {
        const prompt = changelogEntryPrompt(info, hint, cfg, paths, entry);
        const l = await launchAgent(key!, prompt, repoUrl(repo));
        job.agentId = l.agentId; job.runId = l.runId; job.result = `agent ${l.agentId}`;
        await postComment(instId, repo, prNumber, `**Shiplog** is drafting the changelog entry with a Cursor cloud agent on your plan. A PR updating ${pathsLabel(paths)} will follow.`);
      } else {
        job.result = changelogEntryPrompt(info, hint, cfg, paths, entry);
        await postComment(instId, repo, prNumber, fallbackComment(info, job.result));
      }
    } else {
      const v = version!;
      const note = await releaseBumpNotes(instId, repo, v, mode, cfg);
      const withNote = (body: string) => (note ? `${body}\n\n${note}` : body);
      const releasePaths = allChangelogPaths(cfg);
      if (mode === "neon") {
        const blocks: string[] = [];
        const allNotes: string[] = [];
        for (const path of releasePaths) {
          const key = neonChangelogKey(repo, path);
          const before = await store.getChangelog(key);
          const notes = unreleased(before);
          if (!notes) continue;
          allNotes.push(notes);
          const summary = await draftSummary(v, notes);
          const md = cutRelease(before, v, today(), summary);
          await persistChangelog(store, key, md);
          blocks.push(`<!-- ${path} -->\n## [${v.replace(/^v/, "")}] - ${today()}\n\n${summary}\n\n${notes}`);
        }
        let audienceBlock = "";
        if (notesEnabled(cfg) && allNotes.length) {
          const bundle = await draftStoredAudienceNotes(cfg, v, allNotes.join("\n\n"));
          await persistChangelog(store, notesStorageKey(repo, v), JSON.stringify(bundle, null, 2));
          audienceBlock = `\n\n${formatAudienceNotesBlock(v, bundle)}`;
        }
        job.result = blocks.length ? blocks.join("\n\n\n") : `no unreleased content`;
        await postComment(instId, repo, prNumber, withNote(`**Shiplog** release notes for **${v}**:\n\n\`\`\`md\n${job.result}\n\`\`\`${audienceBlock}`));
        fireUserNotify(instId, cfg, { event: "release_cut", repo, prNumber, prUrl: info.url, version: v, detail: job.result });
      } else if (mode === "cursor") {
        const queued = await queuedFor(instId, repo);
        const extra = releaseNoteExtras(cfg, v);
        const prompt = queued.length ? batchReleasePrompt(repo, queued, cfg, v, extra) : releaseAgentPrompt(repo, v, cfg, extra);
        const l = await launchAgent(key!, prompt, repoUrl(repo));
        job.agentId = l.agentId; job.runId = l.runId; job.changelogPaths = releasePaths;
        job.result = `agent ${l.agentId}${queued.length ? ` (${queued.length} queued PRs)` : ""}`;
        const queuedEntries = queued.map(entryOf); // read before markBatched overwrites job.result
        await markBatched(queued, job.id);
        const leftOut = await leftOutSince(job, cfg, queuedEntries).catch((e) => { console.error("[shiplog] left-out summary failed:", (e as Error).message); return ""; });
        await postComment(instId, repo, prNumber, withNote(`**Shiplog** is cutting **${v}** with a Cursor cloud agent. A release PR will follow.${leftOut ? `\n\n${leftOut}` : ""}`));
      } else {
        job.result = releaseAgentPrompt(repo, v, cfg, releaseNoteExtras(cfg, v));
        await postComment(instId, repo, prNumber, withNote(fallbackComment(info, job.result, v)));
      }
    }
    if (job.status !== "queued") job.status = mode === "cursor" ? "running" : "done";
  } catch (e) {
    job.status = "failed";
    job.result = (e as Error).message;
  }
  await store.putJob(job);
  await trackJobCompletion(job);
  return job;
}

const entryOf = (j: Job): QueuedEntry => { try { return JSON.parse(j.result ?? "{}"); } catch { return {} as QueuedEntry; } };
const batchOf = (j: Job): string => { try { return JSON.parse(j.result ?? "{}").batch ?? ""; } catch { return ""; } };

/** PRs that will not get their own bullet in this release: grouped bots and changelog jobs skipped since the previous release. */
async function leftOutSince(current: Job, cfg: ShiplogConfig, queued: QueuedEntry[]): Promise<string> {
  const others = (await getStore().listJobs(current.installationId)).filter((j) => j.id !== current.id);
  const skipped = skippedSince(others, current.repo, current.createdAt);
  const grouped = cfg.groupBots ? groupBotEntries(queued).grouped : [];
  return leftOutBlock({ grouped, skipped });
}

async function queuedFor(installationId: string, repo: string): Promise<Job[]> {
  return (await getStore().listJobs(installationId)).filter((j) => j.status === "queued" && j.repo === repo).reverse();
}
async function markBatched(queued: Job[], batchJobId: string) {
  for (const j of queued) { j.status = "done"; j.result = `batched into ${batchJobId}`; await getStore().putJob(j); }
}

type BatchGroup = { installationId: string; repo: string; path: string; jobs: Job[] };

/** Queued jobs grouped per installation, repo and changelog file (a PR can span several package changelogs). Oldest first. */
function groupByChangelog(queued: Job[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();
  for (const j of [...queued].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const e = entryOf(j);
    const paths = e.changelogPaths?.length ? e.changelogPaths : ["__default__"];
    for (const path of paths) {
      const k = `${j.installationId}\t${j.repo}\t${path}`;
      const g = groups.get(k);
      if (g) g.jobs.push(j);
      else groups.set(k, { installationId: j.installationId, repo: j.repo, path, jobs: [j] });
    }
  }
  return [...groups.values()];
}

/**
 * One agent per group, adding the queued PRs under [Unreleased] (no version cut). Callers hold the cron poll lock, so the
 * daily cron and a dashboard click never run this at the same time. Each group re-reads its jobs first.
 * A PR in several changelog files stays queued, with the files still to do, until every file's run has launched;
 * a failed launch leaves exactly the failed files queued for the next try.
 */
async function launchBatches(groups: BatchGroup[], stillQueued: (j: Job) => boolean, deadline = Infinity): Promise<{ launched: number; prs: number; failed: number }> {
  const store = getStore();
  let launched = 0, failed = 0;
  const done = new Set<string>();
  for (const { installationId, repo, path, jobs: grp } of groups) {
    // Past the deadline the lock may have expired: leave the rest queued (reported as failed) rather than race another holder.
    if (Date.now() > deadline) { failed++; continue; }
    const ids = new Set(grp.map((j) => j.id));
    const live = (await store.listJobs()).filter((j) => ids.has(j.id) && j.status === "queued" && stillQueued(j))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!live.length) continue;
    try {
      const key = await userKey(installationId);
      if (!key) continue;
      const cfg = await loadRepoConfig(installationId, repo);
      const changelogPath = path === "__default__" ? cfg.changelogPath : path;
      const entries = live.map(entryOf);
      const l = await launchAgent(key, batchPrompt(repo, entries, styleOf(cfg, changelogPath), undefined, undefined, changelogPath, { groupBots: cfg.groupBots }), repoUrl(repo));
      const job: Job = { id: randomUUID(), deliveryId: `batch-${randomUUID()}`, installationId, repo, prNumber: "", prUrl: repoUrl(repo), kind: "changelog", mode: "cursor", status: "running", agentId: l.agentId, runId: l.runId, changelogPaths: [changelogPath], result: `agent ${l.agentId} (${entries.length} queued PRs)`, createdAt: new Date().toISOString() };
      await store.putJob(job);
      const finished: Job[] = [];
      for (const j of live) {
        const e = entryOf(j);
        const rest = (e.changelogPaths ?? []).filter((p) => p !== path);
        if (path !== "__default__" && rest.length) { j.result = JSON.stringify({ ...e, changelogPaths: rest }); await store.putJob(j); }
        else finished.push(j);
      }
      await markBatched(finished, job.id);
      for (const j of live) done.add(j.id);
      launched++;
    } catch (e) {
      failed++;
      console.error("[shiplog] batch flush failed:", (e as Error).message);
    }
  }
  return { launched, prs: done.size, failed };
}

/** Daily batches (cron): one agent per repo and changelog file for PRs queued with `batch: daily`. Returns agents launched. */
export async function flushBatches(): Promise<number> {
  const daily = (await getStore().listJobs()).filter((j) => j.status === "queued" && batchOf(j) === "daily");
  return (await launchBatches(groupByChangelog(daily), (j) => batchOf(j) === "daily")).launched;
}

export type FlushResult =
  | { status: "launched"; agentRuns: number; prs: number; /** Changelog files whose run failed to start; their PRs stay queued for them. */ failedRuns: number }
  | { status: "empty" } | { status: "no_key" } | { status: "busy" } | { status: "failed" };

/** How long a manual flush may hold the cron poll lock before it counts as abandoned. */
const FLUSH_LOCK_TTL_MS = 120_000;
const FLUSH_LOCK_MARGIN_MS = 30_000;

/** Queued for a batch with a readable entry. Records from before `batch` was stored count as release batches. */
function isBatchQueued(j: Job): boolean {
  if (j.status !== "queued") return false;
  const b = batchOf(j);
  return (b === "" || b === "release" || b === "daily") && typeof entryOf(j).title === "string";
}

/**
 * Dashboard "Run batch now": every queued PR of one repo (release or daily batch) goes into one agent run per changelog file,
 * billed to the installation's Cursor key. Adds them under [Unreleased]; cutting a version stays `/shiplog release`.
 */
export async function flushRepoNow(installationId: string, repo: string): Promise<FlushResult> {
  const store = getStore();
  const queuedNow = async () => (await store.listJobs(installationId)).filter((j) => j.repo === repo && isBatchQueued(j));
  if (!(await queuedNow()).length) return { status: "empty" };
  if (!(await userKey(installationId))) return { status: "no_key" };
  // Same lock as the cron poll: a click during the cron, or two clicks at once, wait instead of launching twice. The TTL frees it after a crash.
  if (!(await store.acquireCronPollLock(FLUSH_LOCK_TTL_MS))) return { status: "busy" };
  // Stop starting runs well before the lease expires, and don't release a lease that may now belong to someone else.
  const deadline = Date.now() + FLUSH_LOCK_TTL_MS - FLUSH_LOCK_MARGIN_MS;
  try {
    const queued = await queuedNow();
    if (!queued.length) return { status: "empty" };
    const { launched, prs, failed } = await launchBatches(groupByChangelog(queued), isBatchQueued, deadline);
    if (launched) return { status: "launched", agentRuns: launched, prs, failedRuns: failed };
    return failed ? { status: "failed" } : { status: "empty" };
  } finally {
    if (Date.now() <= deadline + FLUSH_LOCK_MARGIN_MS / 2) await store.releaseCronPollLock();
  }
}

/** Days a queued PR may wait before recovery. SHIPLOG_QUEUE_STALE_DAYS, default 14; 0 turns recovery off. */
function staleDays(): number {
  const raw = process.env.SHIPLOG_QUEUE_STALE_DAYS?.trim();
  return raw && /^\d+$/.test(raw) ? Number(raw) : 14;
}

/**
 * Batch queue recovery (cron). Per repo with a queued PR older than the stale age:
 * - no usable Cursor key: post every queued PR as one ready-to-run prompt and close them ($0, nothing is lost);
 * - key present: remind once on the newest PR to cut a release. Never launches an agent, so no surprise spend.
 */
export async function recoverStaleQueue(now: Date = new Date()): Promise<{ recovered: number; reminded: number }> {
  const days = staleDays();
  const out = { recovered: 0, reminded: 0 };
  if (!days) return out;
  const cutoff = now.getTime() - days * 24 * 3600 * 1000;
  const store = getStore();
  const byRepo = new Map<string, Job[]>();
  const all = (await store.listJobs()).filter((j) => j.status === "queued").sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const j of all) {
    const k = `${j.installationId}\t${j.repo}`;
    byRepo.set(k, [...(byRepo.get(k) ?? []), j]);
  }
  for (const queued of byRepo.values()) {
    if (!queued.some((j) => Date.parse(j.createdAt) <= cutoff)) continue;
    const { installationId, repo } = queued[0];
    const newest = queued[queued.length - 1];
    const list = queued.map((j) => `#${j.prNumber}`).join(", ");
    try {
      if (!(await userKey(installationId))) {
        const cfg = await loadRepoConfig(installationId, repo);
        const prompt = batchReleasePrompt(repo, queued, cfg);
        const info: PrInfo = { repo, number: newest.prNumber, title: "", body: "", url: newest.prUrl };
        await postComment(installationId, repo, newest.prNumber, `${fallbackComment(info, prompt)}\n\n<sub>These ${queued.length} PRs (${list}) were queued for a batch, but this installation has no Cursor key any more.</sub>`);
        for (const j of queued) { j.status = "done"; j.result = `recovered: prompt posted on #${newest.prNumber}`; await store.putJob(j); }
        out.recovered += queued.length;
        continue;
      }
      // One reminder per repo per stale period, however many PRs merge in between.
      const last = Math.max(0, ...queued.map((j) => Date.parse(entryOf(j).staleNotifiedAt ?? "") || 0));
      if (last && last > cutoff) continue;
      const since = queued[0].createdAt.slice(0, 10);
      const body = queued.every((j) => batchOf(j) === "daily")
        ? `**Shiplog**: ${queued.length} merged PRs (${list}) have been waiting for the daily batch since ${since}, and the agent launch keeps failing. Check the Cursor key on the Shiplog setup page. Shiplog retries on every cron run.`
        : `**Shiplog**: ${queued.length} merged PRs (${list}) have been waiting for a release since ${since}. Comment \`/shiplog release vX.Y.Z\` on any PR to ship them in one agent run.`;
      await postComment(installationId, repo, newest.prNumber, body);
      for (const j of queued) { j.result = JSON.stringify({ ...JSON.parse(j.result ?? "{}"), staleNotifiedAt: now.toISOString() }); await store.putJob(j); }
      out.reminded += queued.length;
    } catch (e) { console.error("[shiplog] stale queue recovery failed:", (e as Error).message); }
  }
  return out;
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
        const announce = Boolean(run.prUrl && !job.prOpened);
        job.prOpened = run.prUrl;
        job.status = run.prUrl ? "done" : "failed";
        job.result = run.prUrl ? `PR ${run.prUrl}` : `agent ${run.status}`;
        await store.putJob(job); updated++;
        if (announce) {
          const paths = job.changelogPaths?.length ? job.changelogPaths : ["CHANGELOG.md"];
          await postComment(job.installationId, job.repo, job.prNumber, `**Shiplog** opened ${run.prUrl} updating ${pathsLabel(paths)}.`);
          const cfg = await loadRepoConfig(job.installationId, job.repo);
          const detail = job.kind === "release" ? `Release PR: ${run.prUrl}` : `Changelog PR: ${run.prUrl}`;
          const payload: NotifyPayload = job.kind === "release"
            ? { event: "release_cut", repo: job.repo, prNumber: job.prNumber, prUrl: job.prUrl, detail }
            : { event: "changelog_entry", repo: job.repo, prNumber: job.prNumber, prUrl: job.prUrl, detail };
          fireUserNotify(job.installationId, cfg, payload);
          await trackAgentAnnouncement(job);
        }
      }
    } catch (e) { console.error("[shiplog] poll error:", (e as Error).message); }
  }
  return updated;
}
