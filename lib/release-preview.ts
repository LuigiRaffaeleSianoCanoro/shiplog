import type { QueuedEntry } from "./changelog";
import type { Job } from "./store/types";

/** Same bot test as `exclude.authors: [bots]`: an app, a service account, or an app acting through a user. */
export function isBotAuthor(author: unknown): boolean {
  if (!author || typeof author !== "object") return false;
  const a = author as { app?: unknown; serviceAccount?: unknown; user?: { performedVia?: { app?: unknown }; type?: unknown } };
  return Boolean(a.app || a.serviceAccount || a.user?.performedVia?.app || a.user?.type === "Bot");
}

const BUMP = /^\w+(?:\([^)]*\))?!?:\s*bump (\S+) from \S+ to (\S+)/i;

/** "chore(deps): bump next from 16.4.2 to 16.4.5" becomes "next 16.4.5"; other titles lose only their prefix. No angle brackets survive. */
export function botUpdateText(title: string): string {
  const m = BUMP.exec(title.trim());
  const text = m ? `${m[1]} ${m[2]}` : title.replace(/^\w+(\([^)]*\))?!?:\s*/, "").trim() || title.trim();
  return text.replace(/[<>]/g, "");
}

/** Bot PRs collapse into one "Dependency updates" bullet, in queue order. A bot PR with an explicit `/shiplog entry` keeps its own bullet. */
export function groupBotEntries(entries: QueuedEntry[]): { rest: QueuedEntry[]; grouped: QueuedEntry[]; bullet: string | null } {
  const grouped = entries.filter((e) => e.bot && !e.entry);
  if (!grouped.length) return { rest: entries, grouped: [], bullet: null };
  const bullet = `Dependency updates: ${grouped.map((e) => `${botUpdateText(e.title)} (#${e.number})`).join(", ")}`;
  return { rest: entries.filter((e) => !grouped.includes(e)), grouped, bullet };
}

export interface SkippedPr { number: string; reason: string }

/** Markdown for the release comment: what did not get its own bullet, and why. Empty when nothing was left out. */
export function leftOutBlock({ grouped, skipped }: { grouped: QueuedEntry[]; skipped: SkippedPr[] }): string {
  if (!grouped.length && !skipped.length) return "";
  const lines = ["**Left out of the changelog, and why**", ""];
  if (grouped.length) lines.push(`- ${grouped.length} bot PR${grouped.length === 1 ? "" : "s"} grouped into one bullet: ${grouped.map((e) => `#${e.number}`).join(", ")}`);
  for (const s of skipped) lines.push(`- #${s.number}: ${s.reason}`);
  return lines.join("\n");
}

/** Changelog jobs skipped (`ignored`) since the latest release (at or before `at` when given), oldest first. */
export function skippedSince(jobs: Job[], repo: string, at?: string): SkippedPr[] {
  const mine = jobs.filter((j) => j.repo === repo);
  const lastRelease = mine.filter((j) => j.kind === "release" && j.status !== "ignored" && j.status !== "failed" && (at === undefined || j.createdAt <= at))
    .map((j) => j.createdAt).sort().pop();
  return mine
    .filter((j) => j.kind === "changelog" && j.status === "ignored" && j.prNumber && (!lastRelease || j.createdAt > lastRelease))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((j) => ({ number: j.prNumber, reason: (j.result ?? "").replace(/^excluded by /, "") }));
}

export interface PreviewBullet { number: string; url: string; text: string; section: string | null; breaking: boolean; /** Set by `/shiplog entry`, so it ships verbatim; otherwise the agent rewrites the PR title. */ explicit: boolean; bot: boolean }

export interface RepoReleasePreview {
  installationId: string; repo: string; batch: "release" | "daily";
  /** When the oldest queued PR merged. */
  since: string;
  bullets: PreviewBullet[]; botBullet: string | null; grouped: QueuedEntry[]; skipped: SkippedPr[];
  /** Changelog files the queued PRs touch (the repo default as `default`): a manual flush starts one agent run per file. */
  changelogFiles: string[];
}

const DEFAULT_FILE = "default";

function queuedEntry(j: Job): (QueuedEntry & { batch?: string }) | null {
  try {
    const e = JSON.parse(j.result ?? "");
    return e && typeof e === "object" && typeof e.title === "string" && (e.batch === undefined || e.batch === "release" || e.batch === "daily") ? e : null;
  } catch { return null; }
}

/**
 * What the next batched release will contain, per repo with queued PRs: the same grouping and skip rules the release comment uses.
 * Reads jobs only, so opening the dashboard never launches or bills anything.
 */
export function releasePreviews(jobs: Job[], groupBots: (installationId: string, repo: string) => boolean): RepoReleasePreview[] {
  const byRepo = new Map<string, { installationId: string; repo: string; items: { job: Job; e: QueuedEntry & { batch?: string } }[] }>();
  for (const job of jobs) {
    if (job.status !== "queued") continue;
    const e = queuedEntry(job);
    if (!e) continue;
    const k = `${job.installationId}\t${job.repo}`;
    const g = byRepo.get(k) ?? { installationId: job.installationId, repo: job.repo, items: [] };
    g.items.push({ job, e });
    byRepo.set(k, g);
  }
  return [...byRepo.values()]
    .sort((a, b) => a.installationId.localeCompare(b.installationId) || a.repo.localeCompare(b.repo))
    .map(({ installationId, repo, items }) => {
      items.sort((a, b) => a.job.createdAt.localeCompare(b.job.createdAt));
      const entries = items.map((i) => i.e);
      const { rest, grouped, bullet } = groupBots(installationId, repo) ? groupBotEntries(entries) : { rest: entries, grouped: [], bullet: null };
      return {
        installationId, repo,
        batch: items.every((i) => i.e.batch === "daily") ? "daily" : "release",
        since: items[0].job.createdAt,
        bullets: rest.map((e) => ({ number: e.number, url: e.url, text: e.entry || e.title, section: e.section ?? null, breaking: !!e.breaking, explicit: !!e.entry, bot: !!e.bot })),
        botBullet: bullet, grouped,
        changelogFiles: [...new Set(entries.flatMap((e) => (e.changelogPaths?.length ? e.changelogPaths : [DEFAULT_FILE])))],
        skipped: skippedSince(jobs.filter((j) => j.installationId === installationId), repo), // no clock bound: the latest release wins
      };
    });
}
