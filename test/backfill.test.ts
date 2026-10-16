import { beforeEach, describe, expect, it, vi } from "vitest";

async function freshStore() {
  const { MemoryStore } = await import("@/lib/store/memory");
  const storeMod = await import("@/lib/store");
  const store = new MemoryStore();
  storeMod.setStore(store);
  await store.upsertInstallation({ id: "i_hist", namespace: "luigi", status: "active", createdAt: new Date().toISOString() });
  return store;
}

describe("history backfill", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.ORIGIN_APP_ID;
    delete process.env.ORIGIN_APP_PRIVATE_KEY;
    vi.resetModules();
  });

  it("is idempotent without Origin credentials", async () => {
    await freshStore();
    const backfill = await import("@/lib/backfill");
    const a = await backfill.backfillRepoHistory("i_hist", "luigi/demo");
    const b = await backfill.backfillRepoHistory("i_hist", "luigi/demo");
    expect(a.outcome).toBe("skipped_no_origin");
    expect(b.outcome).toBe("skipped_existing");
    const store = (await import("@/lib/store")).getStore();
    expect((await store.getInstallation("i_hist"))?.historyBackfillAt?.["luigi/demo"]).toMatch(/^skipped:no-vcs:/);
  });

  it("writes changelog via Origin when configured", async () => {
    await freshStore();
    process.env.ORIGIN_APP_ID = "app_test";
    process.env.ORIGIN_APP_PRIVATE_KEY = "secret-key-material";
    vi.resetModules();
    await freshStore();
    const backfill = await import("@/lib/backfill");
    const origin = await import("@/lib/origin");
    vi.spyOn(origin, "installationToken").mockResolvedValue("oit_test");
    vi.spyOn(origin, "getRepoFile").mockResolvedValue(null);
    vi.spyOn(origin, "listMergedPullRequests").mockResolvedValue([
      { number: "1", title: "feat: launch", body: "", mergedAt: "2026-01-10T00:00:00Z" },
    ]);
    vi.spyOn(origin, "listSemverTags").mockResolvedValue([]);
    const commit = vi.spyOn(origin, "commitChangelogFile").mockResolvedValue();
    const r = await backfill.backfillRepoHistory("i_hist", "luigi/demo");
    expect(r.outcome).toBe("written");
    expect(commit).toHaveBeenCalledOnce();
    expect(String(commit.mock.calls[0][3])).toContain("launch (#1)");
    const store = (await import("@/lib/store")).getStore();
    expect((await store.getInstallation("i_hist"))?.historyBackfillAt?.["luigi/demo"]).toMatch(/^done:/);
  });

  it("skips when the repo already has changelog content", async () => {
    process.env.ORIGIN_APP_ID = "app_test";
    process.env.ORIGIN_APP_PRIVATE_KEY = "secret-key-material";
    vi.resetModules();
    await freshStore();
    const backfill = await import("@/lib/backfill");
    const origin = await import("@/lib/origin");
    vi.spyOn(origin, "installationToken").mockResolvedValue("oit_test");
    vi.spyOn(origin, "getRepoFile").mockResolvedValue("# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Already here (#9)\n");
    const list = vi.spyOn(origin, "listMergedPullRequests");
    const r = await backfill.backfillRepoHistory("i_hist", "luigi/demo");
    expect(r.outcome).toBe("skipped_existing");
    expect(list).not.toHaveBeenCalled();
  });
});
