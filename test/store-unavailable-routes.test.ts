import { afterEach, describe, expect, it, vi } from "vitest";
import { setStore, StoreAuthError, type Store } from "@/lib/store";
import { MemoryStore } from "@/lib/store/memory";
import { loadPublicChangelog } from "@/lib/public-changelog";
import { GET as feedJson } from "@/app/(changelog)/[namespace]/[repo]/feed.json/route";
import { GET as feedXml } from "@/app/(changelog)/[namespace]/[repo]/feed.xml/route";
import { GET as apiChangelog } from "@/app/api/v1/changelogs/[namespace]/[repo]/route";
import { GET as apiPackages } from "@/app/api/v1/changelogs/[namespace]/[repo]/packages/route";

/** A store whose every read fails the way a disconnected Vercel Blob store does. */
function brokenStore(err: Error = new StoreAuthError("shiplog/v1/")): Store {
  return new Proxy({} as Store, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return () => Promise.reject(err);
    },
  });
}

const ctx = { params: Promise.resolve({ namespace: "acme", repo: "demo" }) };
const req = (path: string) => new Request(`https://shiplog.test${path}`, { headers: { "user-agent": "vitest" } });

afterEach(() => vi.restoreAllMocks());

describe("routes when changelog storage is unavailable", () => {
  it.each([
    ["feed.json", () => feedJson(req("/acme/demo/feed.json"), ctx)],
    ["feed.xml", () => feedXml(req("/acme/demo/feed.xml"), ctx)],
    ["v1 changelog", () => apiChangelog(req("/api/v1/changelogs/acme/demo"), ctx)],
    ["v1 packages", () => apiPackages(req("/api/v1/changelogs/acme/demo/packages"), ctx)],
  ])("%s answers 503 and is not cacheable", async (_name, call) => {
    setStore(brokenStore());
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("v1 changelog keeps 404 for an unknown repo when storage works", async () => {
    setStore(new MemoryStore(`/tmp/shiplog-empty-${Math.random()}.json`));
    const res = await apiChangelog(req("/api/v1/changelogs/acme/demo"), ctx);
    expect(res.status).toBe(404);
  });
});

describe("loadPublicChangelog", () => {
  it("reports store_unavailable for auth failures", async () => {
    expect(await loadPublicChangelog("acme", "demo", brokenStore())).toEqual({ status: "store_unavailable" });
  });

  it("reports not_found when no installation exists", async () => {
    const store = new MemoryStore(`/tmp/shiplog-empty-${Math.random()}.json`);
    expect(await loadPublicChangelog("acme", "demo", store)).toEqual({ status: "not_found" });
  });

  it("rethrows other storage errors instead of hiding them as 503", async () => {
    await expect(loadPublicChangelog("acme", "demo", brokenStore(new Error("boom")))).rejects.toThrow("boom");
  });
});

describe("feed.json cross-origin reads (widget, roadmap 15)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows any origin to read the public JSON feed without credentials", async () => {
    const file = `/tmp/shiplog-cors-${Math.random()}.json`;
    vi.stubEnv("SHIPLOG_DATA_FILE", file);
    const store = new MemoryStore(file);
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" } as never);
    await store.putChangelog("acme/demo", "# Changelog\n\n## [1.0.0] - 2026-11-01\n\n### Added\n\n- Widget (#1)\n");
    setStore(store);
    const res = await feedJson(req("/acme/demo/feed.json"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    const body = await res.json();
    expect(body.repo).toBe("acme/demo");
    expect(body.releases[0].sections.Added).toEqual(["Widget (#1)"]);
  });
});
