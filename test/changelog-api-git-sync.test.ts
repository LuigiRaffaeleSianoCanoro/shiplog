import { afterEach, describe, expect, it, vi } from "vitest";
import { addEntry, cutRelease } from "@/lib/changelog";
import { getChangelogApiResponse } from "@/lib/changelog-api-http";
import { resolveReadableChangelog } from "@/lib/changelog-read";
import { DEFAULT_CONFIG } from "@/lib/config";
import { mcpToolHandlers } from "@/lib/mcp-tools";
import { StoreAuthError } from "@/lib/store";
import { MemoryStore } from "@/lib/store/memory";

afterEach(() => vi.restoreAllMocks());

const STORE_MD = addEntry(null, "Added", "from store (#1)");
const GIT_MD = addEntry(null, "Added", "from git (#2)");
const PACKAGE_MD = addEntry(null, "Fixed", "from package store (#3)");

async function seededStore() {
  const store = new MemoryStore();
  await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
  await store.putChangelog("acme/demo", STORE_MD);
  await store.putChangelog("acme/demo::packages/web/CHANGELOG.md", PACKAGE_MD);
  return store;
}

async function withFlag(syncFromGit: boolean, changelogPath = "CHANGELOG.md") {
  const repoConfig = await import("@/lib/repo-config");
  const vcs = await import("@/lib/vcs");
  vi.spyOn(repoConfig, "loadRepoConfig").mockResolvedValue({ ...DEFAULT_CONFIG, syncFromGit, changelogPath });
  return vcs;
}

describe("resolveReadableChangelog with sync_from_git", () => {
  it("keeps the store, including monorepo keys, when the flag is off", async () => {
    const store = await seededStore();
    const vcs = await withFlag(false);
    const git = vi.spyOn(vcs, "getRepoFile").mockResolvedValue(GIT_MD);
    const root = await resolveReadableChangelog("acme", "demo", store);
    expect(root?.markdown).toContain("from store");
    const pkg = await resolveReadableChangelog("acme", "demo", store, "packages/web/CHANGELOG.md");
    expect(pkg?.markdown).toContain("from package store");
    expect(git).not.toHaveBeenCalled();
  });

  it("uses the git file on the API resolver when the flag is on", async () => {
    const store = await seededStore();
    const vcs = await withFlag(true);
    vi.spyOn(vcs, "getRepoFile").mockResolvedValue(GIT_MD);
    const r = await resolveReadableChangelog("acme", "demo", store);
    expect(r?.markdown).toContain("from git");
    expect(r?.markdown).not.toContain("from store");
    expect(vcs.getRepoFile).toHaveBeenCalledWith("i1", "acme/demo", "CHANGELOG.md");
  });

  it("uses cfg.changelogPath when the flag is on and no path override is set", async () => {
    const store = await seededStore();
    const vcs = await withFlag(true, "docs/CHANGES.md");
    const git = vi.spyOn(vcs, "getRepoFile").mockResolvedValue(addEntry(null, "Added", "from custom path (#5)"));
    const r = await resolveReadableChangelog("acme", "demo", store);
    expect(r?.markdown).toContain("from custom path");
    expect(r?.changelogPath).toBe("docs/CHANGES.md");
    expect(git).toHaveBeenCalledWith("i1", "acme/demo", "docs/CHANGES.md");
  });

  it("falls back to the repoSlug store key when a package git read misses", async () => {
    const store = await seededStore();
    const vcs = await withFlag(true);
    vi.spyOn(vcs, "getRepoFile").mockResolvedValue(null);
    const r = await resolveReadableChangelog("acme", "demo", store, "packages/web/CHANGELOG.md");
    expect(r?.markdown).toContain("from store");
    expect(r?.markdown).not.toContain("from package store");
  });

  it("does not fetch an unsafe ?changelog= path from git", async () => {
    const store = await seededStore();
    const vcs = await withFlag(true);
    const git = vi.spyOn(vcs, "getRepoFile").mockResolvedValue(GIT_MD);
    const r = await resolveReadableChangelog("acme", "demo", store, "../secrets.md");
    expect(git).not.toHaveBeenCalled();
    expect(r?.markdown).not.toContain("from git");
  });

  it("a successful git read still works when getChangelog would fail", async () => {
    const store = await seededStore();
    const vcs = await withFlag(true);
    vi.spyOn(vcs, "getRepoFile").mockResolvedValue(GIT_MD);
    vi.spyOn(store, "getChangelog").mockRejectedValue(new StoreAuthError("acme/demo"));
    const r = await resolveReadableChangelog("acme", "demo", store);
    expect(r?.markdown).toContain("from git");
  });
});

describe("v1 API and MCP with sync_from_git", () => {
  it("GET changelog payload prefers git when the flag is on", async () => {
    const store = await seededStore();
    const vcs = await withFlag(true);
    vi.spyOn(vcs, "getRepoFile").mockResolvedValue(GIT_MD);
    const payload = await getChangelogApiResponse("acme", "demo", store, "https://shiplog.example", new URLSearchParams());
    const body = JSON.stringify(payload);
    expect(body).toContain("from git");
    expect(body).not.toContain("from store");
  });

  it("MCP get_changelog and get_release use the git file", async () => {
    const store = await seededStore();
    const vcs = await withFlag(true);
    let gitMd = addEntry(null, "Added", "from git (#2)");
    gitMd = cutRelease(gitMd, "2.0.0", "2026-11-23");
    vi.spyOn(vcs, "getRepoFile").mockResolvedValue(gitMd);
    const changelog = await mcpToolHandlers.get_changelog(store, "https://shiplog.example", {
      namespace: "acme",
      repo: "demo",
    });
    expect(changelog.isError).toBeFalsy();
    expect(changelog.content[0].text).toContain("from git");
    expect(changelog.content[0].text).not.toContain("from store");
    const release = await mcpToolHandlers.get_release(store, "https://shiplog.example", {
      namespace: "acme",
      repo: "demo",
      version: "2.0.0",
    });
    expect(release.isError).toBeFalsy();
    expect(release.content[0].text).toContain("2.0.0");
  });

  it("MCP reports store_unavailable when git misses and the store is unreadable", async () => {
    const store = await seededStore();
    const vcs = await withFlag(true);
    vi.spyOn(vcs, "getRepoFile").mockResolvedValue(null);
    vi.spyOn(store, "getChangelog").mockRejectedValue(new StoreAuthError("acme/demo"));
    const out = await mcpToolHandlers.get_changelog(store, "https://shiplog.example", {
      namespace: "acme",
      repo: "demo",
    });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain("store_unavailable");
  });
});
