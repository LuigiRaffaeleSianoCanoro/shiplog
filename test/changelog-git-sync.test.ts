import { afterEach, describe, expect, it, vi } from "vitest";
import { addEntry } from "@/lib/changelog";
import { DEFAULT_CONFIG } from "@/lib/config";
import { GIT_SYNC_TIMEOUT_MS, readChangelogMarkdown } from "@/lib/changelog-sync";
import { loadPublicChangelog, resolvePublicChangelog } from "@/lib/public-changelog";
import { StoreAuthError } from "@/lib/store";
import { MemoryStore } from "@/lib/store/memory";

afterEach(() => vi.restoreAllMocks());

const STORE_MD = addEntry(null, "Added", "from store (#1)");
const GIT_MD = addEntry(null, "Added", "from git (#2)");

async function seededStore() {
  const store = new MemoryStore();
  await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
  await store.putChangelog("acme/demo", STORE_MD);
  return store;
}

describe("readChangelogMarkdown", () => {
  it("reads only the store when the flag is off, and does not fetch the repo file", async () => {
    const store = await seededStore();
    const readRepoFile = vi.fn(async () => GIT_MD);
    const md = await readChangelogMarkdown({
      store,
      installationId: "i1",
      repoSlug: "acme/demo",
      changelogPath: "CHANGELOG.md",
      syncFromGit: false,
      readRepoFile,
    });
    expect(md).toContain("from store");
    expect(readRepoFile).not.toHaveBeenCalled();
  });

  it("uses the git file when the flag is on, even if the store is stale", async () => {
    const store = await seededStore();
    const md = await readChangelogMarkdown({
      store,
      installationId: "i1",
      repoSlug: "acme/demo",
      changelogPath: "CHANGELOG.md",
      syncFromGit: true,
      readRepoFile: async () => GIT_MD,
    });
    expect(md).toContain("from git");
    expect(md).not.toContain("from store");
  });

  it("falls back to the store when the git read returns null or throws", async () => {
    const store = await seededStore();
    const missing = await readChangelogMarkdown({
      store,
      installationId: "i1",
      repoSlug: "acme/demo",
      changelogPath: "CHANGELOG.md",
      syncFromGit: true,
      readRepoFile: async () => null,
    });
    expect(missing).toContain("from store");
    const thrown = await readChangelogMarkdown({
      store,
      installationId: "i1",
      repoSlug: "acme/demo",
      changelogPath: "CHANGELOG.md",
      syncFromGit: true,
      readRepoFile: async () => {
        throw new Error("origin 500");
      },
    });
    expect(thrown).toContain("from store");
  });

  it("falls back to the store when the git read exceeds the timeout", async () => {
    const store = await seededStore();
    const md = await readChangelogMarkdown({
      store,
      installationId: "i1",
      repoSlug: "acme/demo",
      changelogPath: "CHANGELOG.md",
      syncFromGit: true,
      timeoutMs: 20,
      readRepoFile: () => new Promise(() => {}),
    });
    expect(md).toContain("from store");
  });

  it("uses a successful empty git file instead of the store", async () => {
    const store = await seededStore();
    const md = await readChangelogMarkdown({
      store,
      installationId: "i1",
      repoSlug: "acme/demo",
      changelogPath: "CHANGELOG.md",
      syncFromGit: true,
      readRepoFile: async () => "",
    });
    expect(md).toBe("");
  });

  it("reads a custom changelog path from git, and falls back to the public page's store key", async () => {
    const store = await seededStore();
    const git = await readChangelogMarkdown({
      store,
      installationId: "i1",
      repoSlug: "acme/demo",
      changelogPath: "docs/CHANGES.md",
      syncFromGit: true,
      readRepoFile: async (_id, repo, path) => {
        expect(repo).toBe("acme/demo");
        expect(path).toBe("docs/CHANGES.md");
        return addEntry(null, "Fixed", "git package (#4)");
      },
    });
    expect(git).toContain("git package");
    const fallback = await readChangelogMarkdown({
      store,
      installationId: "i1",
      repoSlug: "acme/demo",
      changelogPath: "docs/CHANGES.md",
      syncFromGit: true,
      readRepoFile: async () => null,
    });
    expect(fallback).toContain("from store");
  });

  it("exposes a 2 second default timeout", () => {
    expect(GIT_SYNC_TIMEOUT_MS).toBe(2000);
  });
});

describe("loadPublicChangelog with sync_from_git", () => {
  it("serves git markdown on the public loader when the flag is on", async () => {
    const store = await seededStore();
    const repoConfig = await import("@/lib/repo-config");
    const vcs = await import("@/lib/vcs");
    vi.spyOn(repoConfig, "loadRepoConfig").mockResolvedValue({ ...DEFAULT_CONFIG, syncFromGit: true });
    vi.spyOn(vcs, "getRepoFile").mockResolvedValue(GIT_MD);
    const loaded = await loadPublicChangelog("acme", "demo", store);
    expect(loaded.status).toBe("ok");
    if (loaded.status !== "ok") return;
    expect(loaded.data.markdown).toContain("from git");
    expect(vcs.getRepoFile).toHaveBeenCalledWith("i1", "acme/demo", "CHANGELOG.md");
  });

  it("keeps store markdown when the flag is off", async () => {
    const store = await seededStore();
    const repoConfig = await import("@/lib/repo-config");
    const vcs = await import("@/lib/vcs");
    vi.spyOn(repoConfig, "loadRepoConfig").mockResolvedValue(DEFAULT_CONFIG);
    const git = vi.spyOn(vcs, "getRepoFile").mockResolvedValue(GIT_MD);
    const r = await resolvePublicChangelog("acme", "demo", store);
    expect(r?.markdown).toContain("from store");
    expect(git).not.toHaveBeenCalled();
  });

  it("returns store_unavailable when git fails and the store changelog is unreadable", async () => {
    const store = await seededStore();
    const repoConfig = await import("@/lib/repo-config");
    const vcs = await import("@/lib/vcs");
    vi.spyOn(repoConfig, "loadRepoConfig").mockResolvedValue({ ...DEFAULT_CONFIG, syncFromGit: true });
    vi.spyOn(vcs, "getRepoFile").mockResolvedValue(null);
    vi.spyOn(store, "getChangelog").mockRejectedValue(new StoreAuthError("acme/demo"));
    expect(await loadPublicChangelog("acme", "demo", store)).toEqual({ status: "store_unavailable" });
  });

  it("a successful git read still works when getChangelog would fail", async () => {
    const store = await seededStore();
    vi.spyOn(store, "getChangelog").mockRejectedValue(new StoreAuthError("acme/demo"));
    const md = await readChangelogMarkdown({
      store,
      installationId: "i1",
      repoSlug: "acme/demo",
      changelogPath: "CHANGELOG.md",
      syncFromGit: true,
      readRepoFile: async () => GIT_MD,
    });
    expect(md).toContain("from git");
  });

  it("uses cfg.changelogPath on the public loader, not a hardcoded CHANGELOG.md", async () => {
    const store = await seededStore();
    const repoConfig = await import("@/lib/repo-config");
    const vcs = await import("@/lib/vcs");
    vi.spyOn(repoConfig, "loadRepoConfig").mockResolvedValue({ ...DEFAULT_CONFIG, syncFromGit: true, changelogPath: "docs/CHANGES.md" });
    const git = vi.spyOn(vcs, "getRepoFile").mockResolvedValue(addEntry(null, "Added", "from custom path (#5)"));
    const loaded = await loadPublicChangelog("acme", "demo", store);
    expect(loaded.status).toBe("ok");
    if (loaded.status !== "ok") return;
    expect(loaded.data.markdown).toContain("from custom path");
    expect(git).toHaveBeenCalledWith("i1", "acme/demo", "docs/CHANGES.md");
  });

  it("stays ok with store markdown when git returns null", async () => {
    const store = await seededStore();
    const repoConfig = await import("@/lib/repo-config");
    const vcs = await import("@/lib/vcs");
    vi.spyOn(repoConfig, "loadRepoConfig").mockResolvedValue({ ...DEFAULT_CONFIG, syncFromGit: true });
    vi.spyOn(vcs, "getRepoFile").mockResolvedValue(null);
    const loaded = await loadPublicChangelog("acme", "demo", store);
    expect(loaded).toMatchObject({ status: "ok" });
    if (loaded.status !== "ok") return;
    expect(loaded.data.markdown).toContain("from store");
  });

});
