import { EMPTY } from "./changelog";
import type { Store } from "./store";
import { getRepoFile } from "./vcs";

/** Cap on the default-branch changelog read so a hung VCS cannot stall the public page. */
export const GIT_SYNC_TIMEOUT_MS = 2000;

export type RepoFileReader = (installationId: string, repo: string, path: string) => Promise<string | null>;

async function firstSettled<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Changelog markdown from git when `syncFromGit` is on, otherwise from the store. Git failures fall back to the store. */
export async function readChangelogMarkdown(opts: {
  store: Store;
  installationId: string;
  repoSlug: string;
  changelogPath: string;
  syncFromGit: boolean;
  readRepoFile?: RepoFileReader;
  timeoutMs?: number;
}): Promise<string> {
  if (opts.syncFromGit) {
    try {
      const read = opts.readRepoFile ?? getRepoFile;
      const file = await firstSettled(
        read(opts.installationId, opts.repoSlug, opts.changelogPath),
        opts.timeoutMs ?? GIT_SYNC_TIMEOUT_MS,
      );
      if (typeof file === "string") return file;
    } catch (err) {
      console.error("[shiplog] git changelog sync failed:", (err as Error).message);
    }
  }
  // Same key the public page used before this flag existed, including when a custom git path misses.
  return (await opts.store.getChangelog(opts.repoSlug)) ?? EMPTY;
}
