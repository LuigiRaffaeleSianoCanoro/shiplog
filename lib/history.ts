import {
  addEntry,
  BREAKING_MARK,
  EMPTY,
  isBreaking,
  stripPrefix,
  unreleased,
  type Section,
} from "./changelog";
import { excludedBy, sectionFor, type ShiplogConfig } from "./config";

export interface HistoricalPr {
  number: string;
  title: string;
  body: string;
  mergedAt: string;
  labels?: { name: string }[];
  author?: unknown;
}

export interface HistoricalTag {
  name: string;
  /** RFC 3339 instant used to bucket PRs (tag time or commit time). */
  at: string;
}

const RELEASE_HEADING = /^## \[\d+\.\d+\.\d+/m;

/** True when Shiplog should generate an initial changelog (missing or still the empty shell). */
export function changelogNeedsBackfill(md: string | null): boolean {
  if (!md?.trim()) return true;
  if (RELEASE_HEADING.test(md)) return false;
  const u = unreleased(md);
  if (/^- /m.test(u)) return false;
  if (!md.includes("## [Unreleased]") && !RELEASE_HEADING.test(md) && md.trim().length > 24) return false;
  return true;
}

const semverRe = /^v?(\d+)\.(\d+)\.(\d+)/;
export function compareSemverTags(a: string, b: string): number {
  const pa = semverRe.exec(a);
  const pb = semverRe.exec(b);
  if (!pa || !pb) return a.localeCompare(b);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d;
  }
  return 0;
}

function prPayload(pr: HistoricalPr) {
  return { title: pr.title, body: pr.body, labels: pr.labels, author: pr.author };
}

function bulletFor(pr: HistoricalPr, cfg: ShiplogConfig): { section: Section; line: string } {
  const section = sectionFor(pr.title, cfg) ?? "Changed";
  const core = stripPrefix(pr.title) || pr.title;
  const mark = isBreaking(pr.title, pr.body) ? BREAKING_MARK : "";
  return { section, line: `${mark}${core} (#${pr.number})` };
}

function sectionBody(prs: HistoricalPr[], cfg: ShiplogConfig): string {
  let scratch = "## [Unreleased]\n\n";
  const seen = new Set<string>();
  for (const pr of prs) {
    const { section, line } = bulletFor(pr, cfg);
    const key = `${section}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scratch = addEntry(scratch, section, line);
  }
  return unreleased(scratch);
}

function dated(iso: string): string {
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date(iso).toISOString().slice(0, 10);
}

/** Build a Keep a Changelog file from merged PRs and semver tags (newest release sections first). */
export function buildHistoricalChangelog(prs: HistoricalPr[], tags: HistoricalTag[], cfg: ShiplogConfig): string {
  const merged = prs
    .filter((p) => p.mergedAt && !excludedBy(prPayload(p), cfg))
    .sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt));
  const semverTags = [...tags]
    .filter((t) => semverRe.test(t.name))
    .sort((a, b) => compareSemverTags(a.name, b.name));
  const boundaries = semverTags.map((t) => ({ ...t, t: Date.parse(t.at) }));

  const buckets: HistoricalPr[][] = semverTags.map(() => []);
  const unreleasedBucket: HistoricalPr[] = [];
  for (const pr of merged) {
    const t = Date.parse(pr.mergedAt);
    let placed = false;
    for (let i = 0; i < boundaries.length; i++) {
      if (t <= boundaries[i].t) {
        buckets[i].push(pr);
        placed = true;
        break;
      }
    }
    if (!placed) unreleasedBucket.push(pr);
  }

  let doc = EMPTY;
  for (const pr of unreleasedBucket) {
    const { section, line } = bulletFor(pr, cfg);
    doc = addEntry(doc, section, line);
  }

  const releaseBlocks: string[] = [];
  for (let i = boundaries.length - 1; i >= 0; i--) {
    const tag = boundaries[i];
    const body = sectionBody(buckets[i], cfg);
    if (!body.trim()) continue;
    const version = tag.name.replace(/^v/, "");
    releaseBlocks.push(`## [${version}] - ${dated(tag.at)}\n\n${body}\n`);
  }

  return releaseBlocks.length ? `${doc.trimEnd()}\n\n${releaseBlocks.join("\n")}` : doc;
}
