import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setStore, StoreAuthError, type Store } from "@/lib/store";
import { MemoryStore } from "@/lib/store/memory";
import { addEntry } from "@/lib/changelog";

const SEG = join(import.meta.dirname, "..", "app/(changelog)/[namespace]/[repo]");
const broken = (): Store => new Proxy({} as Store, { get: (_t, p) => (p === "then" ? undefined : () => Promise.reject(new StoreAuthError("shiplog/v1/"))) });
const props = { params: Promise.resolve({ namespace: "acme", repo: "demo" }) };

afterEach(() => vi.unstubAllEnvs());

describe("public changelog page when storage is down", () => {
  it("throws instead of rendering a 200 outage view, so ISR keeps the last good page and fresh renders fail with 5xx", async () => {
    setStore(broken());
    const { default: Page } = await import("@/app/(changelog)/[namespace]/[repo]/page");
    await expect(Page(props)).rejects.toBeInstanceOf(StoreAuthError);
  });

  it("still renders normally when storage works", async () => {
    const file = `/tmp/shiplog-outage-${Math.random()}.json`;
    vi.stubEnv("SHIPLOG_DATA_FILE", file);
    const store = new MemoryStore(file);
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" } as never);
    await store.putChangelog("acme/demo", addEntry(null, "Added", "Widget (#1)"));
    setStore(store);
    const { default: Page } = await import("@/app/(changelog)/[namespace]/[repo]/page");
    expect(await Page(props)).toBeTruthy();
  });

  it("the segment has a client error boundary with the outage copy and a retry", () => {
    const file = join(SEG, "error.tsx");
    expect(existsSync(file)).toBe(true);
    const src = readFileSync(file, "utf8");
    expect(src.trimStart().startsWith('"use client"')).toBe(true);
    expect(src).toContain("Changelog temporarily unavailable");
    expect(src).toMatch(/reset\(\)/);
  });
});
