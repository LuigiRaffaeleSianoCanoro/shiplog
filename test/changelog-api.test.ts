import { describe, expect, it } from "vitest";
import { addEntry, cutRelease } from "@/lib/changelog";
import {
  buildChangelogApiPayload,
  changelogPathFromQuery,
  findRelease,
  listPublicPackagePaths,
  resolveReadableChangelog,
  storageKeyForChangelogPath,
} from "@/lib/changelog-read";
import { MemoryStore } from "@/lib/store/memory";
import { mcpToolHandlers } from "@/lib/mcp-tools";

describe("storageKeyForChangelogPath", () => {
  it("uses repo slug for default changelog", () => {
    expect(storageKeyForChangelogPath("acme/demo", null)).toBe("acme/demo");
    expect(storageKeyForChangelogPath("acme/demo", "CHANGELOG.md")).toBe("acme/demo");
  });

  it("uses repo::path for monorepo changelogs", () => {
    expect(storageKeyForChangelogPath("acme/demo", "packages/web/CHANGELOG.md")).toBe(
      "acme/demo::packages/web/CHANGELOG.md",
    );
  });
});

describe("listPublicPackagePaths", () => {
  it("lists package changelogs and skips notes or notify keys", () => {
    const keys = [
      "acme/demo",
      "acme/demo::packages/web/CHANGELOG.md",
      "acme/demo::notes::1.0.0",
      "@notify:i1",
      "other/repo",
    ];
    expect(listPublicPackagePaths("acme/demo", keys)).toEqual({
      root: true,
      packages: [{ changelogPath: "packages/web/CHANGELOG.md" }],
    });
  });
});

describe("resolveReadableChangelog", () => {
  it("returns root changelog for active namespace", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
    await store.putChangelog("acme/demo", addEntry(null, "Added", "Launch (#1)"));
    const r = await resolveReadableChangelog("acme", "demo", store);
    expect(r?.changelogPath).toBe("CHANGELOG.md");
    expect(r?.markdown).toContain("Launch");
  });

  it("returns package changelog when path is set", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
    await store.putChangelog("acme/demo::packages/web/CHANGELOG.md", addEntry(null, "Fixed", "Widget (#2)"));
    const r = await resolveReadableChangelog("acme", "demo", store, "packages/web/CHANGELOG.md");
    expect(r?.markdown).toContain("Widget");
  });

  it("hides disconnected installs", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "disconnected", createdAt: "2026-01-01" });
    expect(await resolveReadableChangelog("acme", "demo", store)).toBeNull();
  });
});

describe("buildChangelogApiPayload and findRelease", () => {
  it("builds v1 JSON with releases", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
    let md = addEntry(null, "Added", "A (#1)");
    md = cutRelease(md, "1.0.0", "2026-10-01");
    await store.putChangelog("acme/demo", md);
    const resolved = await resolveReadableChangelog("acme", "demo", store);
    expect(resolved).not.toBeNull();
    const payload = buildChangelogApiPayload(resolved!, "https://shiplog.example");
    expect(payload.apiVersion).toBe("v1");
    expect(payload.releases.some((r) => r.version === "1.0.0")).toBe(true);
    const one = findRelease(payload, "1.0.0");
    expect(one?.sections.Added).toContain("A (#1)");
    expect(findRelease(payload, "9.9.9")).toBeNull();
  });
});

describe("changelogPathFromQuery", () => {
  it("reads changelog query param", () => {
    expect(changelogPathFromQuery(new URLSearchParams("changelog=packages%2Fweb%2FCHANGELOG.md"))).toBe(
      "packages/web/CHANGELOG.md",
    );
    expect(changelogPathFromQuery(new URLSearchParams())).toBeNull();
  });
});

describe("mcpToolHandlers", () => {
  it("get_changelog returns JSON text", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
    await store.putChangelog("acme/demo", addEntry(null, "Added", "MCP (#1)"));
    const out = await mcpToolHandlers.get_changelog(store, "https://shiplog.example", {
      namespace: "acme",
      repo: "demo",
    });
    expect(out.isError).toBeFalsy();
    expect(out.content[0].text).toContain("MCP");
  });

  it("get_release 404s unknown version", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
    await store.putChangelog("acme/demo", addEntry(null, "Added", "x"));
    const out = await mcpToolHandlers.get_release(store, "https://shiplog.example", {
      namespace: "acme",
      repo: "demo",
      version: "99.0.0",
    });
    expect(out.isError).toBe(true);
  });
});
