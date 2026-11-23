import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobMock = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }));

vi.mock("@vercel/blob", () => ({ list: blobMock.list, get: blobMock.get }));

describe("/api/health storage readability", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    blobMock.list.mockReset();
    blobMock.get.mockReset();
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

  it("returns 503 when list works but reading a listed blob is forbidden", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    blobMock.list.mockResolvedValue({ blobs: [{ pathname: "shiplog/v1/installations/i1.json" }], hasMore: false });
    blobMock.get.mockRejectedValue(new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden"));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, storageReadable: false });
  });

  it("returns 200 when a listed blob can be read", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    blobMock.list.mockResolvedValue({ blobs: [{ pathname: "shiplog/v1/installations/i1.json" }], hasMore: false });
    blobMock.get.mockResolvedValue({ stream: new ReadableStream({ start(c) { c.close(); } }) });
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, storage: "vercel-blob", storageReadable: true });
    expect(blobMock.get).toHaveBeenCalledWith("shiplog/v1/installations/i1.json", expect.objectContaining({ access: "private" }));
  });

  it("answers 503 within the timeout when the probe hangs", async () => {
    vi.useFakeTimers();
    try {
      process.env.BLOB_READ_WRITE_TOKEN = "test-token";
      blobMock.list.mockReturnValue(new Promise(() => {}));
      const { GET } = await import("@/app/api/health/route");
      const pending = GET();
      await vi.advanceTimersByTimeAsync(2100);
      const res = await pending;
      expect(res.status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not probe Blob for the memory store", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ storageReadable: true });
    expect(blobMock.list).not.toHaveBeenCalled();
  });
});
