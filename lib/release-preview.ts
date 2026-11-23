import type { QueuedEntry } from "./changelog";

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
