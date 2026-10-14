import { describe, expect, it, vi, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

let cookie = "";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: cookie }) }) }));
async function setup(validKeys: string[]) {
  vi.resetModules();
  Object.assign(process.env, { SHIPLOG_KEY_ENC: randomBytes(32).toString("base64"), SHIPLOG_BYOK_ENABLED: "true" });
  const { MemoryStore } = await import("@/lib/store/memory");
  const store = new MemoryStore(); (await import("@/lib/store")).setStore(store);
  await store.upsertInstallation({ id: "i_1", namespace: "acme", status: "active", createdAt: "" });
  cookie = (await import("@/lib/session")).signSession("i_1");
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    const key = Buffer.from(auth.replace("Basic ", ""), "base64").toString().replace(/:$/, "");
    return new Response("{}", { status: validKeys.includes(key) ? 200 : 401 });
  }));
  const route = await import("@/app/api/keys/route");
  const post = (key: string, kind?: string) => route.POST(new Request("https://x/api/keys", { method: "POST", body: JSON.stringify({ installationId: "i_1", key, kind }) }));
  return { store, route, post };
}
afterEach(() => vi.unstubAllGlobals());
const A = "key_aaaaaaaaaaaaaaaaaaaa1111", B = "key_bbbbbbbbbbbbbbbbbbbb2222", BAD = "key_cccccccccccccccccccc3333";

describe("key storage and rotation", () => {
  it("stores only ciphertext + last4 and returns only last4", async () => {
    const { store, post } = await setup([A]);
    const r = await post(A);
    const j = await r.json();
    expect(j).toEqual({ ok: true, last4: "1111", kind: "personal", rotated: false });
    const rec = await store.getKey("i_1");
    expect(JSON.stringify(rec)).not.toContain(A);
    expect(JSON.stringify(rec)).not.toContain("aaaaaaaa");
    expect(rec?.ciphertext).toBeTruthy();
  });
  it("rotates: validates the new key first, replaces the old record", async () => {
    const { store, post } = await setup([A, B]);
    await post(A);
    const r = await post(B, "service_account");
    expect(await r.json()).toMatchObject({ ok: true, last4: "2222", kind: "service_account", rotated: true });
    const rec = await store.getKey("i_1");
    expect(rec?.last4).toBe("2222"); expect(rec?.rotatedAt).toBeTruthy();
  });
  it("a rejected new key leaves the current key in place", async () => {
    const { store, post } = await setup([A]);
    await post(A);
    expect((await post(BAD)).status).toBe(422);
    expect((await store.getKey("i_1"))?.last4).toBe("1111");
  });
  it("requires the install session", async () => {
    const { post } = await setup([A]);
    cookie = "";
    expect((await post(A)).status).toBe(401);
  });
});
