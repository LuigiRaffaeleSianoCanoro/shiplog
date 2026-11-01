import { revalidatePath } from "next/cache";
import type { Store } from "./store/types";

export function publicChangelogTag(repoSlug: string) {
  return `public-changelog:${repoSlug}`;
}

/** Storage keys may include `::path`; public pages are keyed by owner/repo slug. */
export function repoSlugFromStorageKey(storageKey: string) {
  const i = storageKey.indexOf("::");
  return i >= 0 ? storageKey.slice(0, i) : storageKey;
}

export function revalidatePublicChangelog(storageKey: string) {
  const slug = repoSlugFromStorageKey(storageKey);
  const slash = slug.indexOf("/");
  if (slash <= 0) return;
  const namespace = slug.slice(0, slash);
  const repo = slug.slice(slash + 1);
  if (!namespace || !repo) return;
  const paths = [
    `/${namespace}/${repo}`,
    `/${namespace}/${repo}/feed.xml`,
    `/${namespace}/${repo}/feed.json`,
    `/api/v1/changelogs/${namespace}/${repo}`,
    `/api/v1/changelogs/${namespace}/${repo}/packages`,
  ];
  try {
    for (const p of paths) revalidatePath(p);
  } catch {
    /* outside Next request (tests, scripts) */
  }
}

export async function persistChangelog(store: Store, repo: string, md: string) {
  await store.putChangelog(repo, md);
  revalidatePublicChangelog(repo);
}
