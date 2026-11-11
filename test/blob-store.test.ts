import { beforeEach, describe, expect, it, vi } from "vitest";

const blobMock = vi.hoisted(() => ({
  get: vi.fn(),
  head: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  get: blobMock.get,
  head: blobMock.head,
  list: blobMock.list,
  put: blobMock.put,
  del: blobMock.del,
  BlobNotFoundError: class BlobNotFoundError extends Error {
    constructor(message?: string) {
      super(message ?? "Blob not found");
      this.name = "BlobNotFoundError";
    }
  },
  BlobError: class BlobError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BlobError";
    }
  },
}));

const { get, head, list, put, del } = blobMock;

import { BlobNotFoundError } from "@vercel/blob";
import { BlobStore } from "@/lib/store/blob";
import { StoreAuthError } from "@/lib/store/store-auth-error";

function blob403() {
  const err = new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden");
  err.name = "BlobError";
  return err;
}

function getStreamBody(text: string) {
  return { stream: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } }) };
}

describe("BlobStore readJson 403 disambiguation", () => {
  beforeEach(() => {
    get.mockReset();
    head.mockReset();
    list.mockReset();
    put.mockReset();
    del.mockReset();
  });

  it("treats 403 as missing when head reports not found and falls back via listInstallations", async () => {
    const store = new BlobStore();
    const nsPath = "shiplog/v1/ns/luigi.json";
    const instPath = "shiplog/v1/installations/i1.json";
    const installation = {
      id: "i1",
      namespace: "luigi",
      status: "active" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    get.mockImplementation(async (pathname: string) => {
      if (pathname === nsPath) throw blob403();
      if (pathname === instPath) {
        return getStreamBody(JSON.stringify(installation));
      }
      return null;
    });
    head.mockImplementation(async (pathname: string) => {
      if (pathname === nsPath) throw new BlobNotFoundError();
      return { pathname, uploadedAt: new Date() };
    });
    list.mockResolvedValue({
      blobs: [{ pathname: instPath, uploadedAt: new Date() }],
      cursor: undefined,
      hasMore: false,
    });

    const active = await store.getActiveInstallationByNamespace("luigi");
    expect(active).toMatchObject({ id: "i1", namespace: "luigi" });
    expect(put).toHaveBeenCalled();
  });

  it("throws StoreAuthError when 403 but head says blob exists", async () => {
    const store = new BlobStore();
    const nsPath = "shiplog/v1/ns/luigi.json";

    get.mockImplementation(async (pathname: string) => {
      if (pathname === nsPath) throw blob403();
      return null;
    });
    head.mockImplementation(async (pathname: string) => {
      if (pathname === nsPath) return { pathname, uploadedAt: new Date() };
      throw new BlobNotFoundError();
    });

    await expect(store.getActiveInstallationByNamespace("luigi")).rejects.toBeInstanceOf(StoreAuthError);
  });
});

describe("changelog API store auth", () => {
  it("maps StoreAuthError to 503 store_unavailable JSON", async () => {
    const { jsonResponse, withStoreAuth } = await import("@/lib/changelog-api-http");
    const err = new StoreAuthError("luigi");
    const res = await withStoreAuth(async () => { throw err; });
    expect(res).toBeInstanceOf(Response);
    if (!(res instanceof Response)) throw new Error("expected Response");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "store_unavailable" });
  });
});
