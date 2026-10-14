import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

const master = randomBytes(32).toString("base64");

async function setup(envOver: Record<string, string>) {
  vi.resetModules();
  for (const k of ["SHIPLOG_LLM_PROVIDER", "SHIPLOG_BYOK_ENABLED", "SUPABASE_URL", "ORIGIN_APP_ID"]) delete process.env[k];
  Object.assign(process.env, { SHIPLOG_KEY_ENC: master, ...envOver });
  const { MemoryStore } = await import("@/lib/store/memory");
  const storeMod = await import("@/lib/store");
  const store = new MemoryStore(); storeMod.setStore(store);
  const jobs = await import("@/lib/jobs");
  return { store, jobs };
}
const merged = (n: string, title: string) => ({ installationId: "i_1", event: { type: "pull_request.merged", payload: { pullRequest: { number: n, title, body: "", webUrl: `https://cursor.com/codebase/luigi/demo/pull/${n}` }, repository: { name: "demo", owner: { slug: "luigi" } } } } });

describe("job flows", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("no key → posts fallback prompt comment", async () => {
    const { store, jobs } = await setup({});
    const job = await jobs.handleEvent(merged("7", "fix: crash on save"), "d1");
    expect(job?.mode).toBe("fallback"); expect(job?.status).toBe("done");
    const [c] = await store.listOutbox();
    expect(c.body).toContain("no Cursor key connected"); expect(c.body).toContain("### Fixed");
  });

  it("neon mode drafts entry, then release cuts notes", async () => {
    const { store, jobs } = await setup({ SHIPLOG_LLM_PROVIDER: "neon", NEON_AI_GATEWAY_BASE_URL: "https://gw.test", NEON_AI_GATEWAY_TOKEN: "t" });
    const replies = [JSON.stringify({ section: "Added", bullet: "Dark mode toggle" }), "This release adds dark mode."];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }))));
    await jobs.handleEvent(merged("8", "feat: dark mode"), "d2");
    expect(await store.getChangelog("luigi/demo")).toContain("- Dark mode toggle (#8)");
    await store.upsertInstallation({ ...(await store.getInstallation("i_1"))!, installerId: "user_owner" });
    const rel = await jobs.handleEvent({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "8", repository: { name: "demo", owner: { slug: "luigi" } } }, comment: { body: "/shiplog release v1.0.0", author: { user: { id: "user_owner" } } } } } }, "d3"); // real Origin shape: repo only under pullRequest
    expect(rel?.kind).toBe("release"); expect(rel?.status).toBe("done");
    const md = await store.getChangelog("luigi/demo");
    expect(md).toMatch(/## \[1\.0\.0\] - \d{4}-\d{2}-\d{2}\n\nThis release adds dark mode\./);
    vi.unstubAllGlobals();
  });

  it("ignores Shiplog's own comments", async () => {
    const { jobs } = await setup({});
    const r = await jobs.handleEvent({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "8", repository: { name: "demo", owner: { slug: "luigi" } } }, comment: { body: "**Shiplog** notes\n/shiplog release v1.0.0" } } } }, "d9");
    expect(r).toBeNull();
  });

  it("with a stored key → launches a Cursor agent", async () => {
    const { store, jobs } = await setup({});
    const { seal, parseMasterKey } = await import("@/lib/crypto");
    await store.putKey({ ...seal("key_abcdefghijklmnop", parseMasterKey(master), "i_1"), installationId: "i_1", last4: "mnop", createdAt: "" });
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("/runs/")
      ? { status: "FINISHED", git: { branches: [{ repoUrl: "r", prUrl: "https://cursor.com/codebase/luigi/demo/pull/99" }] } }
      : { agent: { id: "bc-123" }, run: { id: "run-1" } })));
    vi.stubGlobal("fetch", f);
    const job = await jobs.handleEvent(merged("9", "feat: x"), "d4");
    expect(job?.mode).toBe("cursor"); expect(job?.agentId).toBe("bc-123"); expect(job?.status).toBe("running");
    const sent = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(sent.autoCreatePR).toBe(true); expect(sent.repos[0].url).toBe("https://cursor.com/codebase/luigi/demo"); expect(sent.prompt.text).toContain("CHANGELOG.md");
    expect(await jobs.pollAgents()).toBe(1);
    const [done] = await store.listJobs();
    expect(done.status).toBe("done"); expect(done.prOpened).toContain("/pull/99");
    expect((await store.listOutbox())[0].body).toContain("/pull/99");
    vi.unstubAllGlobals();
  });

  it("uninstall → disconnected, key deleted, later webhooks ignored", async () => {
    const { store, jobs } = await setup({});
    await store.upsertInstallation({ id: "i_1", namespace: "luigi", status: "active", createdAt: "" });
    await store.putKey({ ciphertext: "x", iv: "x", tag: "x", keyVersion: 1, installationId: "i_1", last4: "abcd", createdAt: "" });
    await jobs.handleEvent({ installationId: "i_1", event: { type: "installation.deleted", payload: {} } }, "d5");
    expect((await store.getInstallation("i_1"))?.status).toBe("disconnected");
    expect(await store.getKey("i_1")).toBeNull();
    expect(await jobs.handleEvent(merged("10", "feat: y"), "d6")).toBeNull();
    expect(await store.listOutbox()).toHaveLength(0);
  });

  it("BYOK flag off → fallback even with a stored key", async () => {
    const { store, jobs } = await setup({ SHIPLOG_BYOK_ENABLED: "false" });
    await store.putKey({ ciphertext: "x", iv: "x", tag: "x", keyVersion: 1, installationId: "i_1", last4: "abcd", createdAt: "" });
    expect((await jobs.handleEvent(merged("11", "fix: z"), "d7"))?.mode).toBe("fallback");
  });

  it("tag push on repository.pushed → release job; branch push ignored", async () => {
    const { jobs } = await setup({});
    const push = (ref: string) => ({ installationId: "i_1", event: { type: "repository.pushed", payload: { repository: { name: "demo", owner: { slug: "luigi" } }, refUpdates: [{ ref, before: "0".repeat(40), after: "a".repeat(40), created: true }] } } });
    expect((await jobs.handleEvent(push("refs/tags/v2.0.0"), "t1"))?.kind).toBe("release");
    expect(await jobs.handleEvent(push("refs/heads/main"), "t2")).toBeNull();
  });

  it("dedupes delivery ids", async () => {
    const { store } = await setup({});
    expect(await store.claimDelivery("x")).toBe(true); expect(await store.claimDelivery("x")).toBe(false);
  });
});

describe("llm content shapes", () => {
  it("accepts array-of-blocks content", async () => {
    vi.resetModules();
    Object.assign(process.env, { NEON_AI_GATEWAY_BASE_URL: "https://gw.test", NEON_AI_GATEWAY_TOKEN: "t" });
    const { chat } = await import("@/lib/llm");
    const f = (async () => new Response(JSON.stringify({ choices: [{ message: { content: [{ type: "text", text: "hi " }, { type: "text", text: "there" }] } }] }))) as any;
    expect(await chat("s", "u", f)).toBe("hi there");
  });
});

describe("ping", () => {
  it("ignores Origin ping deliveries (no installation)", async () => {
    vi.resetModules();
    const { MemoryStore } = await import("@/lib/store/memory");
    const storeMod = await import("@/lib/store"); const store = new MemoryStore(); storeMod.setStore(store);
    const { handleEvent } = await import("@/lib/jobs");
    expect(await handleEvent({ installationId: undefined as any, event: { type: "ping", payload: {} } }, "p1")).toBeNull();
    expect(await store.listInstallations()).toHaveLength(0);
  });
});
