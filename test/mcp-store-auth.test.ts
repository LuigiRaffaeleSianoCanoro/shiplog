import { describe, expect, it, vi } from "vitest";
import { addEntry } from "@/lib/changelog";
import { mcpToolHandlers } from "@/lib/mcp-tools";
import { MemoryStore } from "@/lib/store/memory";
import { StoreAuthError } from "@/lib/store/store-auth-error";
import type { Store } from "@/lib/store/types";

const ORIGIN = "https://shiplog.example";

async function seedActiveChangelog(store: Store) {
  await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
  await store.putChangelog("acme/demo", addEntry(null, "Added", "x"));
}

describe("mcpToolHandlers StoreAuthError", () => {
  it("get_changelog returns isError store_unavailable when namespace index read fails", async () => {
    const store = new MemoryStore();
    vi.spyOn(store, "getActiveInstallationByNamespace").mockRejectedValue(new StoreAuthError("acme"));
    const out = await mcpToolHandlers.get_changelog(store, ORIGIN, { namespace: "acme", repo: "demo" });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content[0].text)).toEqual({ error: "store_unavailable" });
  });

  it("get_release returns isError store_unavailable when changelog read fails", async () => {
    const store = new MemoryStore();
    await seedActiveChangelog(store);
    vi.spyOn(store, "getChangelog").mockRejectedValue(new StoreAuthError("acme/demo"));
    const out = await mcpToolHandlers.get_release(store, ORIGIN, {
      namespace: "acme",
      repo: "demo",
      version: "1.0.0",
    });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content[0].text)).toEqual({ error: "store_unavailable" });
  });

  it("list_packages returns isError store_unavailable when package listing fails", async () => {
    const store = new MemoryStore();
    await seedActiveChangelog(store);
    vi.spyOn(store, "listChangelogKeysForRepo").mockRejectedValue(new StoreAuthError("acme/demo"));
    const out = await mcpToolHandlers.list_packages(store, ORIGIN, { namespace: "acme", repo: "demo" });
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content[0].text)).toEqual({ error: "store_unavailable" });
  });

  it("rethrows non-auth store errors", async () => {
    const store = new MemoryStore();
    vi.spyOn(store, "getActiveInstallationByNamespace").mockRejectedValue(new Error("disk full"));
    await expect(
      mcpToolHandlers.get_changelog(store, ORIGIN, { namespace: "acme", repo: "demo" }),
    ).rejects.toThrow("disk full");
  });
});
