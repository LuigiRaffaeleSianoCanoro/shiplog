import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setStore, StoreAuthError, type Store } from "@/lib/store";
import { GET } from "@/app/api/cron/backfill-namespace-index/route";

const authed = () => new Request("https://shiplog.test/api/cron/backfill-namespace-index", { headers: { authorization: "Bearer s3cret" } });

afterEach(() => vi.unstubAllEnvs());

describe("namespace index backfill cron (backlog 14)", () => {
  it("is scheduled weekly in vercel.json, inside Hobby's once-a-day limit", () => {
    const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };
    const job = cfg.crons.find((c) => c.path === "/api/cron/backfill-namespace-index");
    expect(job?.schedule).toMatch(/^\d+ \d+ \* \* [0-6]$/);
  });

  it("rejects calls without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(new Request("https://shiplog.test/api/cron/backfill-namespace-index"));
    expect(res.status).toBe(401);
  });

  it("reports how many index blobs it wrote", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    setStore({ backfillNamespaceIndex: async () => 3 } as unknown as Store);
    const res = await GET(authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, written: 3 });
  });

  it("answers 503 store_unavailable when Blob auth fails", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    setStore({ backfillNamespaceIndex: async () => { throw new StoreAuthError("shiplog/v1/"); } } as unknown as Store);
    const res = await GET(authed());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "store_unavailable" });
  });
});
