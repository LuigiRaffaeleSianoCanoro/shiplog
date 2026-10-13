import { randomUUID } from "node:crypto";
import { env } from "./env";
import { getStore, type Job, type JobMode } from "./store";
import { addEntry, changelogPrompt, classify, cutRelease, parseReleaseCommand, releasePrompt, tagsFromPush, unreleased, type PrInfo } from "./changelog";
import { draftEntry, draftSummary } from "./llm";
import { getRun, launchAgent } from "./cursor";
import { open, parseMasterKey } from "./crypto";
import { commentOnPr, originConfigured } from "./origin";

export interface Envelope {
  deliveryId?: string; installationId: string;
  event: { id?: string; type: string; payload: any };
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

const repoOf = (p: any): string => p?.repository?.owner?.slug && p?.repository?.name ? `${p.repository.owner.slug}/${p.repository.name}` : (p?.repository?.fullName ?? "unknown/unknown");
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
    version = parseReleaseCommand(payload?.comment?.body ?? "");
    if (version) kind = "release";
  }
  if (!kind) return null;

  const prNumber = String(pr?.number ?? payload?.pullRequest?.number ?? "");
  const info: PrInfo = { repo, number: prNumber, title: pr?.title ?? "", body: pr?.body ?? "", url: pr?.webUrl ?? (prNumber ? `${repoUrl(repo)}/pull/${prNumber}` : repoUrl(repo)) };
  const { mode, key } = await pickMode(instId);
  const job: Job = { id: randomUUID(), deliveryId, installationId: instId, repo, prNumber, prUrl: info.url, kind, mode, status: "running", createdAt: now };
  await store.putJob(job);

  try {
    if (kind === "changelog") {
      const hint = classify(info.title);
      if (mode === "neon") {
        const { section, bullet } = await draftEntry(info, hint);
        const md = addEntry(await store.getChangelog(repo), section, bullet);
        await store.putChangelog(repo, md);
        job.result = `### ${section}\n- ${bullet}`;
        await postComment(instId, repo, prNumber, `**Shiplog** drafted a changelog entry for this PR:\n\n\`\`\`md\n## [Unreleased]\n\n${job.result}\n\`\`\`\n\n<sub>Test mode (direct model draft). Comment \`/shiplog release vX.Y.Z\` to cut release notes.</sub>`);
      } else if (mode === "cursor") {
        const l = await launchAgent(key!, changelogPrompt(info, hint), repoUrl(repo));
        job.agentId = l.agentId; job.runId = l.runId; job.result = `agent ${l.agentId}`;
        await postComment(instId, repo, prNumber, `**Shiplog** is drafting the changelog entry with a Cursor cloud agent on your plan. A PR updating \`CHANGELOG.md\` will follow.`);
      } else {
        job.result = changelogPrompt(info, hint);
        await postComment(instId, repo, prNumber, fallbackComment(info, job.result));
      }
    } else {
      const v = version!;
      if (mode === "neon") {
        const before = await store.getChangelog(repo);
        const notes = unreleased(before);
        const summary = notes ? await draftSummary(v, notes) : "Maintenance release.";
        const md = cutRelease(before, v, today(), summary);
        await store.putChangelog(repo, md);
        job.result = `## [${v.replace(/^v/, "")}] - ${today()}\n\n${summary}\n\n${notes}`;
        await postComment(instId, repo, prNumber, `**Shiplog** release notes for **${v}**:\n\n\`\`\`md\n${job.result}\n\`\`\``);
      } else if (mode === "cursor") {
        const l = await launchAgent(key!, releasePrompt(repo, v, today()), repoUrl(repo));
        job.agentId = l.agentId; job.runId = l.runId; job.result = `agent ${l.agentId}`;
        await postComment(instId, repo, prNumber, `**Shiplog** is cutting **${v}** with a Cursor cloud agent. A release PR will follow.`);
      } else {
        job.result = releasePrompt(repo, v, today());
        await postComment(instId, repo, prNumber, fallbackComment(info, job.result, v));
      }
    }
    job.status = mode === "cursor" ? "running" : "done";
  } catch (e) {
    job.status = "failed";
    job.result = (e as Error).message;
  }
  await store.putJob(job);
  return job;
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
