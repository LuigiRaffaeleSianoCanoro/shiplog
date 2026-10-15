import { EMPTY, neonChangelogKey, type Section } from "./changelog";
import {
  buildJsonFeed,
  buildPublicMeta,
  changelogPageUrl,
  parseChangelogDocument,
  publicRepoSlug,
  type ChangelogDocument,
  type JsonFeed,
} from "./public-changelog";
import type { Store } from "./store";

const CHANGELOG_QUERY = "changelog";

export function storageKeyForChangelogPath(repoSlug: string, changelogPath: string | null | undefined): string {
  const path = changelogPath?.trim();
  if (!path || path === "CHANGELOG.md") return repoSlug;
  return neonChangelogKey(repoSlug, path);
}

export function normalizeChangelogPath(changelogPath: string | null | undefined): string {
  const path = changelogPath?.trim();
  return !path || path === "root" ? "CHANGELOG.md" : path;
}

export function changelogPathFromQuery(params: URLSearchParams): string | null {
  const raw = params.get(CHANGELOG_QUERY);
  return raw?.trim() ? raw.trim() : null;
}

export interface PublicPackageListing {
  root: boolean;
  packages: { changelogPath: string }[];
}

/** Filter stored keys to public changelog documents for one repo slug. */
export function listPublicPackagePaths(repoSlug: string, storageKeys: string[]): PublicPackageListing {
  const packages: { changelogPath: string }[] = [];
  let root = false;
  for (const key of storageKeys) {
    if (key.startsWith("@")) continue;
    if (key === repoSlug) {
      root = true;
      continue;
    }
    const prefix = `${repoSlug}::`;
    if (!key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);
    if (suffix.includes("::notes::") || suffix.startsWith("notes::")) continue;
    packages.push({ changelogPath: suffix });
  }
  packages.sort((a, b) => a.changelogPath.localeCompare(b.changelogPath));
  return { root, packages };
}

export interface ResolvedReadableChangelog {
  repoSlug: string;
  namespace: string;
  repoName: string;
  changelogPath: string;
  storageKey: string;
  markdown: string;
  document: ChangelogDocument;
}

export async function resolveReadableChangelog(
  namespace: string,
  repo: string,
  store: Store,
  changelogPath?: string | null,
): Promise<ResolvedReadableChangelog | null> {
  const repoSlug = publicRepoSlug(namespace, repo);
  if (!repoSlug) return null;
  const installs = await store.listInstallations();
  const active = installs.find((i) => i.status === "active" && i.namespace === namespace);
  if (!active) return null;
  const normalized = normalizeChangelogPath(changelogPath);
  const storageKey = storageKeyForChangelogPath(repoSlug, normalized === "CHANGELOG.md" ? null : normalized);
  const markdown = (await store.getChangelog(storageKey)) ?? EMPTY;
  return {
    repoSlug,
    namespace,
    repoName: repo,
    changelogPath: normalized,
    storageKey,
    markdown,
    document: parseChangelogDocument(markdown),
  };
}

export interface ChangelogApiPayload extends JsonFeed {
  apiVersion: "v1";
  changelogPath: string;
  links: {
    self: string;
    packages: string;
    mcp: string;
  };
}

export function buildChangelogApiPayload(
  resolved: ResolvedReadableChangelog,
  origin: string,
  updatedAt = new Date().toISOString(),
): ChangelogApiPayload {
  const meta = buildPublicMeta(origin, resolved.namespace, resolved.repoName, updatedAt);
  const feed = buildJsonFeed(resolved.document, meta);
  const base = `${origin.replace(/\/+$/, "")}/api/v1/changelogs/${encodeURIComponent(resolved.namespace)}/${encodeURIComponent(resolved.repoName)}`;
  const q =
    resolved.changelogPath !== "CHANGELOG.md"
      ? `?${CHANGELOG_QUERY}=${encodeURIComponent(resolved.changelogPath)}`
      : "";
  return {
    apiVersion: "v1",
    changelogPath: resolved.changelogPath,
    links: {
      self: `${base}${q}`,
      packages: `${base}/packages`,
      mcp: `${origin.replace(/\/+$/, "")}/api/mcp`,
    },
    ...feed,
    page: changelogPageUrl(origin, resolved.namespace, resolved.repoName),
  };
}

export interface ReleaseApiPayload {
  apiVersion: "v1";
  repo: string;
  changelogPath: string;
  version: string;
  date: string | null;
  summary: string;
  sections: Partial<Record<Section, string[]>>;
}

export function findRelease(payload: ChangelogApiPayload, version: string): ReleaseApiPayload | null {
  const v = version.replace(/^v/, "");
  const hit = payload.releases.find((r) => r.version === v || r.version === version);
  if (!hit) return null;
  return {
    apiVersion: "v1",
    repo: payload.repo,
    changelogPath: payload.changelogPath,
    version: hit.version,
    date: hit.date,
    summary: hit.summary,
    sections: hit.sections,
  };
}

export const CHANGELOG_READ_CACHE = "public, max-age=60, stale-while-revalidate=300";
