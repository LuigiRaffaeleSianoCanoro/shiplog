import { describe, expect, it, vi, afterEach } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const originPem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const rsaPem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

afterEach(() => vi.unstubAllGlobals());

describe("vcs provider routing", () => {
  it("origin install uses Origin comment endpoint", async () => {
    vi.resetModules();
    Object.assign(process.env, {
      ORIGIN_APP_ID: "app_x",
      ORIGIN_APP_PRIVATE_KEY: originPem,
      SHIPLOG_KEY_ENC: randomBytes(32).toString("base64"),
    });
    delete process.env.GITHUB_APP_ID;
    const { MemoryStore } = await import("@/lib/store/memory");
    const store = new MemoryStore();
    (await import("@/lib/store")).setStore(store);
    await store.upsertInstallation({ id: "o1", namespace: "luigi", provider: "origin", status: "active", createdAt: "" });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (String(url).endsWith("/access_tokens")) return Response.json({ token: "oit" });
        if (String(url).includes("/pulls/2/comments") && init?.method === "POST") return new Response("", { status: 201 });
        return new Response("", { status: 404 });
      }),
    );
    const { commentOnPr } = await import("@/lib/vcs");
    await commentOnPr("o1", "luigi/demo", "2", "hi");
    expect(calls.some((c) => c.includes("api.cursor.com") && c.includes("/pulls/2/comments"))).toBe(true);
    expect(calls.some((c) => c.includes("api.github.com"))).toBe(false);
  });

  it("github install uses GitHub issue comment endpoint", async () => {
    vi.resetModules();
    delete process.env.ORIGIN_APP_ID;
    process.env.GITHUB_APP_ID = "9";
    process.env.GITHUB_APP_PRIVATE_KEY = rsaPem;
    const { MemoryStore } = await import("@/lib/store/memory");
    const store = new MemoryStore();
    (await import("@/lib/store")).setStore(store);
    await store.upsertInstallation({ id: "g1", namespace: "acme", provider: "github", status: "active", createdAt: "" });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (String(url).includes("/access_tokens")) return Response.json({ token: "ghs", expires_at: new Date(Date.now() + 3600_000).toISOString() });
        if (String(url).includes("/issues/2/comments") && init?.method === "POST") return new Response("", { status: 201 });
        return new Response("", { status: 404 });
      }),
    );
    const { commentOnPr } = await import("@/lib/vcs");
    await commentOnPr("g1", "acme/demo", "2", "hi");
    expect(calls.some((c) => c.includes("api.github.com") && c.includes("/issues/2/comments"))).toBe(true);
  });
});
