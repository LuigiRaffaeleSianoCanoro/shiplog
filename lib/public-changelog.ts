import { EMPTY, SECTIONS, type Section } from "./changelog";
import type { Store } from "./store";

const SEG = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function publicRepoSlug(namespace: string, repo: string): string | null {
  if (!SEG.test(namespace) || !SEG.test(repo)) return null;
  return `${namespace}/${repo}`;
}

export interface ReleaseBlock {
  version: string;
  date: string | null;
  summary: string;
  sections: Record<Section, string[]>;
}

export interface ChangelogDocument {
  releases: ReleaseBlock[];
}

function emptySections(): Record<Section, string[]> {
  return Object.fromEntries(SECTIONS.map((s) => [s, [] as string[]])) as Record<Section, string[]>;
}

/** Parse Keep a Changelog markdown into structured releases (includes Unreleased when present). */
export function parseChangelogDocument(md: string | null): ChangelogDocument {
  const text = md && md.trim() ? md : EMPTY;
  const releases: ReleaseBlock[] = [];
  const re = /^## \[(Unreleased|v?[\d.]+(?:-[\w.]+)?)\](?: - (\d{4}-\d{2}-\d{2}))?/gm;
  let m: RegExpExecArray | null;
  const heads: { version: string; date: string | null; start: number; bodyStart: number }[] = [];
  while ((m = re.exec(text))) {
    const version = m[1] === "Unreleased" ? "Unreleased" : m[1].replace(/^v/, "");
    heads.push({ version, date: m[2] ?? null, start: m.index, bodyStart: m.index + m[0].length });
  }
  if (!heads.length) return { releases: [] };
  for (let i = 0; i < heads.length; i++) {
    const end = i + 1 < heads.length ? heads[i + 1].start : text.length;
    const body = text.slice(heads[i].bodyStart, end).trim();
    releases.push(parseReleaseBody(heads[i].version, heads[i].date, body));
  }
  return { releases };
}

function parseReleaseBody(version: string, date: string | null, body: string): ReleaseBlock {
  const sections = emptySections();
  let summary = "";
  let cur: Section | null = null;
  for (const line of body.split("\n")) {
    const h = /^### (\w+)/.exec(line);
    if (h && (SECTIONS as readonly string[]).includes(h[1])) {
      cur = h[1] as Section;
      continue;
    }
    if (line.startsWith("- ")) {
      if (cur) sections[cur].push(line.slice(2).trim());
      else if (!summary) summary = line.slice(2).trim();
      continue;
    }
    if (!cur && line.trim() && !line.startsWith("#")) {
      summary = summary ? `${summary}\n${line.trim()}` : line.trim();
    }
  }
  return { version, date, summary: summary.trim(), sections };
}

export interface PublicChangelogMeta {
  title: string;
  repoSlug: string;
  pageUrl: string;
  updatedAt: string;
}

export interface JsonFeed {
  title: string;
  repo: string;
  updatedAt: string;
  page: string;
  feeds: { rss: string; json: string };
  releases: {
    version: string;
    date: string | null;
    summary: string;
    sections: Partial<Record<Section, string[]>>;
  }[];
}

export function buildJsonFeed(doc: ChangelogDocument, meta: PublicChangelogMeta): JsonFeed {
  return {
    title: meta.title,
    repo: meta.repoSlug,
    updatedAt: meta.updatedAt,
    page: meta.pageUrl,
    feeds: { rss: `${meta.pageUrl}/feed.xml`, json: `${meta.pageUrl}/feed.json` },
    releases: doc.releases
      .filter((r) => r.version !== "Unreleased" || SECTIONS.some((s) => r.sections[s].length))
      .map((r) => ({
        version: r.version,
        date: r.date,
        summary: r.summary,
        sections: Object.fromEntries(SECTIONS.filter((s) => r.sections[s].length).map((s) => [s, r.sections[s]])),
      })),
  };
}

function escXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildRssFeed(doc: ChangelogDocument, meta: PublicChangelogMeta): string {
  const items = doc.releases
    .filter((r) => r.version !== "Unreleased")
    .map((r) => {
      const parts: string[] = [];
      if (r.summary) parts.push(`<p>${escXml(r.summary)}</p>`);
      for (const s of SECTIONS) {
        for (const b of r.sections[s]) parts.push(`<p><strong>${escXml(s)}:</strong> ${escXml(b)}</p>`);
      }
      const pub = r.date ? `${r.date}T00:00:00Z` : meta.updatedAt;
      const guid = `${meta.repoSlug}@${r.version}`;
      return `<item><title>${escXml(r.version)}</title><link>${escXml(meta.pageUrl)}</link><guid isPermaLink="false">${escXml(guid)}</guid><pubDate>${escXml(pub)}</pubDate><description>${parts.join("")}</description></item>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escXml(meta.title)}</title>
<link>${escXml(meta.pageUrl)}</link>
<description>Changelog for ${escXml(meta.repoSlug)}</description>
<lastBuildDate>${escXml(meta.updatedAt)}</lastBuildDate>
<atom:link href="${escXml(`${meta.pageUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>
${items.join("\n")}
</channel>
</rss>`;
}

export interface ResolvedPublicChangelog {
  repoSlug: string;
  namespace: string;
  repoName: string;
  markdown: string;
  document: ChangelogDocument;
}

/** Active installation for namespace plus stored changelog markdown (defaults to EMPTY). */
export async function resolvePublicChangelog(namespace: string, repo: string, store: Store): Promise<ResolvedPublicChangelog | null> {
  const repoSlug = publicRepoSlug(namespace, repo);
  if (!repoSlug) return null;
  const installs = await store.listInstallations();
  const active = installs.find((i) => i.status === "active" && i.namespace === namespace);
  if (!active) return null;
  const markdown = (await store.getChangelog(repoSlug)) ?? EMPTY;
  return {
    repoSlug,
    namespace,
    repoName: repo,
    markdown,
    document: parseChangelogDocument(markdown),
  };
}

export function publicPageTitle(namespace: string, repo: string) {
  return `${repo} changelog`;
}

export function changelogPageUrl(origin: string, namespace: string, repo: string) {
  const base = origin.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}`;
}

export function buildPublicMeta(origin: string, namespace: string, repo: string, updatedAt = new Date().toISOString()): PublicChangelogMeta {
  const pageUrl = changelogPageUrl(origin, namespace, repo);
  return {
    title: publicPageTitle(namespace, repo),
    repoSlug: `${namespace}/${repo}`,
    pageUrl,
    updatedAt,
  };
}
