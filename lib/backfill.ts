import { env } from "./env";
import { parseConfig, CONFIG_PATH, DEFAULT_CONFIG, type ShiplogConfig } from "./config";
import { buildHistoricalChangelog, changelogNeedsBackfill, type HistoricalPr, type HistoricalTag } from "./history";
import {
  commitChangelogFile,
  getRepoFile,
  listInstallationRepos,
  listMergedPullRequests,
  listSemverTags,
  originConfigured,
} from "./origin";
import { getStore } from "./store";

export type BackfillOutcome = "written" | "stored" | "skipped_existing" | "skipped_disabled" | "skipped_no_origin" | "empty";

export interface BackfillResult {
  repo: string;
  outcome: BackfillOutcome;
  prCount?: number;
  tagCount?: number;
}

function historyOpts(cfg: ShiplogConfig) {
  return cfg.history;
}

async function markDone(installationId: string, repo: string, note: string) {
  const store = getStore();
  const inst = await store.getInstallation(installationId);
  if (!inst) return;
  const historyBackfillAt = { ...(inst.historyBackfillAt ?? {}), [repo]: note };
  await store.upsertInstallation({ ...inst, historyBackfillAt });
}

/** Idempotent: generates an initial changelog from merged PRs and semver tags when the file is still empty. */
export async function backfillRepoHistory(installationId: string, repo: string, force = false): Promise<BackfillResult> {
  const store = getStore();
  const inst = await store.getInstallation(installationId);
  if (!inst || inst.status !== "active") return { repo, outcome: "skipped_no_origin" };
  if (!force && inst.historyBackfillAt?.[repo]) return { repo, outcome: "skipped_existing" };

  if (!originConfigured()) {
    await markDone(installationId, repo, `skipped:no-origin:${new Date().toISOString()}`);
    return { repo, outcome: "skipped_no_origin" };
  }

  const cfg = await loadConfig(installationId, repo);
  if (!historyOpts(cfg).enabled) {
    await markDone(installationId, repo, `skipped:disabled:${new Date().toISOString()}`);
    return { repo, outcome: "skipped_disabled" };
  }

  const existing = await getRepoFile(installationId, repo, cfg.changelogPath).catch(() => null);
  if (!force && !changelogNeedsBackfill(existing)) {
    await markDone(installationId, repo, `skipped:existing:${new Date().toISOString()}`);
    return { repo, outcome: "skipped_existing" };
  }

  const maxPrs = historyOpts(cfg).maxPrs;
  const maxTags = historyOpts(cfg).maxTags;
  const prs = await listMergedPullRequests(installationId, repo, maxPrs);
  const tags = await listSemverTags(installationId, repo, maxTags);
  if (!prs.length) {
    await markDone(installationId, repo, `skipped:empty:${new Date().toISOString()}`);
    return { repo, outcome: "empty", prCount: 0, tagCount: tags.length };
  }

  const md = buildHistoricalChangelog(prs, tags, cfg);
  if (env.llmProvider === "neon") await store.putChangelog(repo, md);
  let outcome: BackfillOutcome = env.llmProvider === "neon" ? "stored" : "written";
  try {
    await commitChangelogFile(installationId, repo, cfg.changelogPath, md, "docs(changelog): initial history from Shiplog");
    outcome = env.llmProvider === "neon" ? "stored" : "written";
  } catch (e) {
    if (env.llmProvider !== "neon") throw e;
    outcome = "stored";
  }

  await markDone(installationId, repo, `done:${new Date().toISOString()}`);
  return { repo, outcome, prCount: prs.length, tagCount: tags.length };
}

export async function backfillInstallation(installationId: string, force = false): Promise<BackfillResult[]> {
  if (!originConfigured()) return [];
  const repos = await listInstallationRepos(installationId).catch((e) => {
    console.error("[shiplog] list installation repos failed:", (e as Error).message);
    return [];
  });
  const out: BackfillResult[] = [];
  for (const repo of repos) out.push(await backfillRepoHistory(installationId, repo, force));
  return out;
}

/** Fire-and-forget on first repo touch; safe to call on every webhook. */
export async function maybeBackfillOnFirstVisit(installationId: string, repo: string) {
  if (repo === "unknown/unknown") return;
  const inst = await getStore().getInstallation(installationId);
  if (inst?.historyBackfillAt?.[repo]) return;
  try {
    await backfillRepoHistory(installationId, repo);
  } catch (e) {
    console.error("[shiplog] history backfill failed:", (e as Error).message);
  }
}

async function loadConfig(installationId: string, repo: string) {
  try {
    return parseConfig(await getRepoFile(installationId, repo, CONFIG_PATH));
  } catch {
    return DEFAULT_CONFIG;
  }
}
