import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobMock = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@vercel/blob", () => ({ list: blobMock.list }));

describe("/api/health storage readability", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    blobMock.list.mockReset();
    process.env = { ...prev };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = prev;
  });

  it("returns 503 with storageReadable false when blob list returns 403", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    blobMock.list.mockRejectedValue(new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden"));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, storage: "vercel-blob", storageReadable: false });
    expect(body.provider).toBeDefined();
  });

  it("returns 200 with storageReadable true when blob list succeeds", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    blobMock.list.mockResolvedValue({ blobs: [], cursor: undefined, hasMore: false });
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, storage: "vercel-blob", storageReadable: true });
  });
});
