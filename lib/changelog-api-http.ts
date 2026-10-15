import { CHANGELOG_READ_CACHE, buildChangelogApiPayload, changelogPathFromQuery, findRelease, listPublicPackagePaths, resolveReadableChangelog } from "./changelog-read";
import type { Store } from "./store";

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": CHANGELOG_READ_CACHE,
    },
  });
}

export async function getChangelogApiResponse(namespace: string, repo: string, store: Store, origin: string, searchParams: URLSearchParams) {
  const changelogPath = changelogPathFromQuery(searchParams);
  const resolved = await resolveReadableChangelog(namespace, repo, store, changelogPath);
  if (!resolved) return null;
  return buildChangelogApiPayload(resolved, origin);
}

export async function getReleaseApiResponse(
  namespace: string,
  repo: string,
  version: string,
  store: Store,
  origin: string,
  searchParams: URLSearchParams,
) {
  const payload = await getChangelogApiResponse(namespace, repo, store, origin, searchParams);
  if (!payload) return { kind: "not_found" as const };
  const release = findRelease(payload, version);
  if (!release) return { kind: "no_release" as const };
  return { kind: "ok" as const, release };
}

export async function getPackagesApiResponse(namespace: string, repo: string, store: Store) {
  const resolved = await resolveReadableChangelog(namespace, repo, store);
  if (!resolved) return null;
  const keys = await store.listChangelogKeysForRepo(resolved.repoSlug);
  const listing = listPublicPackagePaths(resolved.repoSlug, keys);
  return { apiVersion: "v1" as const, repo: resolved.repoSlug, ...listing };
}
