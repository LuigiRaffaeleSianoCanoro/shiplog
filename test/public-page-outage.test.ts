import { afterEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setStore, StoreAuthError, type Store } from "@/lib/store";
import { MemoryStore } from "@/lib/store/memory";
import { addEntry } from "@/lib/changelog";

vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));
const files: string[] = [];
const broken = (): Store => new Proxy({} as Store, { get: (_t, p) => (p === "then" ? undefined : () => Promise.reject(new StoreAuthError("shiplog/v1/"))) });
const props = { params: Promise.resolve({ namespace: "acme", repo: "demo" }) };

afterEach(() => { vi.unstubAllEnvs(); for (const f of files.splice(0)) rmSync(f, { force: true }); });

async function healthy() {
  const file = `/tmp/shiplog-outage-${Math.random()}.json`;
  files.push(file);
  vi.stubEnv("SHIPLOG_DATA_FILE", file);
  const store = new MemoryStore(file);
  await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" } as never);
  await store.putChangelog("acme/demo", addEntry(null, "Added", "Widget (#1)"));
  setStore(store);
}

describe("public changelog page when storage is down", () => {
  it("throws instead of rendering a 200 outage view, so ISR keeps the last good page and fresh renders fail with 5xx", async () => {
    setStore(broken());
    const { default: Page } = await import("@/app/(changelog)/[namespace]/[repo]/page");
    await expect(Page(props)).rejects.toBeInstanceOf(StoreAuthError);
  });

  it("still renders the changelog when storage works", async () => {
    await healthy();
    const { default: Page } = await import("@/app/(changelog)/[namespace]/[repo]/page");
    const html = renderToStaticMarkup(await Page(props));
    expect(html).toContain("Widget (#1)");
    expect(html).not.toContain("temporarily unavailable");
  });

  it("an unknown namespace is still a 404, not an outage", async () => {
    await healthy();
    const { default: Page } = await import("@/app/(changelog)/[namespace]/[repo]/page");
    await expect(Page({ params: Promise.resolve({ namespace: "nobody", repo: "demo" }) })).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") });
  });

  it("metadata during an outage is a plain Unavailable title, not an error", async () => {
    setStore(broken());
    const { generateMetadata } = await import("@/app/(changelog)/[namespace]/[repo]/page");
    expect(await generateMetadata(props)).toEqual({ title: "Unavailable" });
  });

  it("the error boundary shows the outage copy, the operator hint and a Try again button", async () => {
    const { default: ChangelogError } = await import("@/app/(changelog)/[namespace]/[repo]/error");
    const html = renderToStaticMarkup(createElement(ChangelogError, { error: new Error("x"), reset: () => {} }));
    expect(html).toContain("Changelog temporarily unavailable");
    expect(html).toContain("Vercel Blob store");
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
  });
});
