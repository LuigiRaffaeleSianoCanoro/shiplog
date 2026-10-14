import { describe, expect, it, vi, afterEach } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
async function setup(perm: string | null, installer = "user_owner") {
  vi.resetModules();
  delete process.env.SHIPLOG_LLM_PROVIDER;
  Object.assign(process.env, { SHIPLOG_KEY_ENC: randomBytes(32).toString("base64"), ORIGIN_APP_ID: "app_t", ORIGIN_APP_PRIVATE_KEY: pem });
  const { MemoryStore } = await import("@/lib/store/memory");
  const store = new MemoryStore(); (await import("@/lib/store")).setStore(store);
  await store.upsertInstallation({ id: "i_1", namespace: "luigi", status: "active", createdAt: "" });
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${u}`);
    if (u.endsWith("/access_tokens")) return Response.json({ token: "oit_x" });
    if (u.endsWith("/app/installations/i_1")) return Response.json({ installedBy: { id: installer }, target: { slug: "luigi", type: "team" } });
    if (u.includes("/permission")) return perm ? Response.json({ permission: perm }) : new Response("", { status: 404 });
    if (u.endsWith("/comments")) return Response.json({});
    return new Response("", { status: 404 });
  }));
  return { store, jobs: await import("@/lib/jobs"), calls };
}
const cmd = (author: unknown) => ({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "3", repository: { name: "demo", owner: { slug: "luigi" } } }, comment: { body: "/shiplog release v2.0.0", author } } } });
afterEach(() => vi.unstubAllGlobals());

describe("/shiplog release authorization", () => {
  it("installer may release (and installer id is cached)", async () => {
    const { jobs, store } = await setup(null);
    expect(await jobs.canRelease("i_1", "luigi/demo", { user: { id: "user_owner" } })).toBe(true);
    expect((await store.getInstallation("i_1"))?.installerId).toBe("user_owner");
    expect((await store.getInstallation("i_1"))?.namespaceType).toBe("team");
  });
  it("write/admin collaborators may release; read-only may not", async () => {
    expect(await (await setup("write")).jobs.canRelease("i_1", "luigi/demo", { user: { id: "user_dev" } })).toBe(true);
    expect(await (await setup("admin")).jobs.canRelease("i_1", "luigi/demo", { user: { id: "user_dev" } })).toBe(true);
    expect(await (await setup("read")).jobs.canRelease("i_1", "luigi/demo", { user: { id: "user_dev" } })).toBe(false);
    expect(await (await setup(null)).jobs.canRelease("i_1", "luigi/demo", { user: { id: "user_dev" } })).toBe(false);
  });
  it("apps, service accounts and missing authors are refused", async () => {
    const { jobs } = await setup("admin");
    expect(await jobs.canRelease("i_1", "luigi/demo", { app: { id: "app_x" } })).toBe(false);
    expect(await jobs.canRelease("i_1", "luigi/demo", { serviceAccount: { id: "sa" } })).toBe(false);
    expect(await jobs.canRelease("i_1", "luigi/demo", undefined)).toBe(false);
  });
  it("unauthorized commenter gets a refusal comment and no release job", async () => {
    const { jobs, store, calls } = await setup("read");
    expect(await jobs.handleEvent(cmd({ user: { id: "user_rando" } }), "d1")).toBeNull();
    expect(await store.listJobs()).toHaveLength(0);
    expect(calls.some((c) => c.startsWith("POST") && c.endsWith("/pulls/3/comments"))).toBe(true);
  });
});
