import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const master = randomBytes(32).toString("base64");
const DAY = 24 * 3600 * 1000;
const repository = { name: "demo", owner: { slug: "luigi" } };
const merge = (n: string, title: string) => ({ installationId: "i_1", event: { type: "pull_request.merged", payload: { pullRequest: { number: n, title, body: "", webUrl: `https://cursor.com/codebase/luigi/demo/pull/${n}` }, repository } } });

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

/** Origin install with a Cursor key and the given .shiplog.yml; records PR comments and agent launches. */
async function setup(yml: string) {
  vi.resetModules();
  const pem = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  for (const k of ["SHIPLOG_LLM_PROVIDER", "SHIPLOG_BYOK_ENABLED", "SUPABASE_URL", "GITHUB_APP_ID", "SHIPLOG_QUEUE_STALE_DAYS"]) vi.stubEnv(k, "");
  vi.stubEnv("SHIPLOG_KEY_ENC", master); vi.stubEnv("ORIGIN_APP_ID", "app_1"); vi.stubEnv("ORIGIN_APP_PRIVATE_KEY", pem);
  vi.stubEnv("SHIPLOG_DATA_FILE", `/tmp/shiplog-flush-${Math.random()}.json`);
  const { MemoryStore } = await import("@/lib/store/memory");
  const store = new MemoryStore(process.env.SHIPLOG_DATA_FILE); (await import("@/lib/store")).setStore(store);
  const { seal, parseMasterKey } = await import("@/lib/crypto");
  await store.upsertInstallation({ id: "i_1", namespace: "luigi", status: "active", createdAt: "", installerId: "u" });
  await store.putKey({ ...seal("key_abcdefghijklmnop", parseMasterKey(master), "i_1"), installationId: "i_1", last4: "mnop", createdAt: "" });
  const comments: { pr: string; body: string }[] = [];
  const f = vi.fn(async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes("/access_tokens")) return new Response(JSON.stringify({ token: "tok" }));
    if (u.includes("/contents")) return new Response(JSON.stringify({ type: "file", content: Buffer.from(yml).toString("base64") }));
    if (u.includes("/comments") && init?.method === "POST") { comments.push({ pr: /pulls\/(\d+)/.exec(u)?.[1] ?? "?", body: JSON.parse(init.body).body }); return new Response("{}"); }
    if (u.includes("/comments")) return new Response(JSON.stringify({ comments: [] }));
    if (u.endsWith("/v1/agents")) return new Response(JSON.stringify({ agent: { id: "bc-1" }, run: { id: "run-1" } }));
    return new Response("{}");
  });
  vi.stubGlobal("fetch", f);
  const jobs = await import("@/lib/jobs");
  const launches = () => f.mock.calls.filter((c: any) => String(c[0]).endsWith("/v1/agents")).length;
  return { store, jobs, comments, launches };
}

async function queueTwo(jobs: any) {
  expect((await jobs.handleEvent(merge("40", "feat: dark mode"), "q1"))?.status).toBe("queued");
  expect((await jobs.handleEvent(merge("41", "fix: crash on save"), "q2"))?.status).toBe("queued");
}

const other = { name: "api", owner: { slug: "luigi" } };

describe("manual batch flush (backlog 10)", () => {
  it("launches one agent for the repo's queued PRs, closes them, and cuts no version", async () => {
    const { store, jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    const r = await jobs.flushRepoNow("i_1", "luigi/demo");
    expect(r).toEqual({ status: "launched", agentRuns: 1, prs: 2 });
    expect(launches()).toBe(1);
    const all = await store.listJobs("i_1");
    const batch = all.find((j: any) => j.status === "running")!;
    expect(batch.result).toContain("2 queued PRs");
    expect(all.filter((j: any) => j.prNumber === "40" || j.prNumber === "41").map((j: any) => j.result)).toEqual([`batched into ${batch.id}`, `batched into ${batch.id}`]);
  });

  it("the prompt covers both PRs under Unreleased, without a release heading", async () => {
    const { jobs } = await setup("batch: release\n");
    await queueTwo(jobs);
    const f = globalThis.fetch as any;
    await jobs.flushRepoNow("i_1", "luigi/demo");
    const call = f.mock.calls.find((c: any) => String(c[0]).endsWith("/v1/agents"));
    const prompt: string = JSON.parse(call[1].body).prompt.text;
    expect(prompt).toContain('<pr number="40"'); expect(prompt).toContain('<pr number="41"');
    expect(prompt).toContain('under "## [Unreleased]"');
    expect(prompt).not.toMatch(/## \[\d/);
  });

  it("a second click finds nothing left and launches nothing", async () => {
    const { jobs, launches } = await setup("batch: daily\n");
    await queueTwo(jobs);
    await jobs.flushRepoNow("i_1", "luigi/demo");
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toEqual({ status: "empty" });
    expect(launches()).toBe(1);
  });

  it("without a Cursor key it launches nothing and keeps the PRs queued", async () => {
    const { store, jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    await store.deleteKey("i_1");
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toEqual({ status: "no_key" });
    expect(launches()).toBe(0);
    expect((await store.listJobs("i_1")).filter((j: any) => j.status === "queued")).toHaveLength(2);
  });

  it("only touches the chosen repo", async () => {
    const { store, jobs } = await setup("batch: release\n");
    await queueTwo(jobs);
    await jobs.handleEvent({ installationId: "i_1", event: { type: "pull_request.merged", payload: { pullRequest: { number: "7", title: "feat: other", body: "", webUrl: "https://cursor.com/codebase/luigi/api/pull/7" }, repository: other } } }, "q3");
    await jobs.flushRepoNow("i_1", "luigi/demo");
    expect((await store.listJobs("i_1")).filter((j: any) => j.status === "queued").map((j: any) => j.repo)).toEqual(["luigi/api"]);
  });
});

describe("POST /api/batch/flush", () => {
  async function post(form: Record<string, string>, opts: { session?: string; origin?: string } = {}) {
    const { COOKIE, signSession } = await import("@/lib/session");
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === COOKIE && opts.session ? { value: signSession(opts.session) } : undefined) }) }));
    const { POST: P } = await import("@/app/api/batch/flush/route");
    return P(new Request("http://localhost:3000/api/batch/flush", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(opts.origin ? { origin: opts.origin } : {}) }, body: new URLSearchParams(form) }));
  }
  afterEach(() => vi.doUnmock("next/headers"));

  it("with the install session: flushes and redirects back to the dashboard with the result", async () => {
    const { jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    const res = await post({ installationId: "i_1", repo: "luigi/demo" }, { session: "i_1", origin: "http://localhost:3000" });
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/dashboard");
    expect(Object.fromEntries(loc.searchParams)).toEqual({ installation_id: "i_1", flush: "launched", repo: "luigi/demo", prs: "2", runs: "1" });
    expect(loc.hash).toBe("#release-preview");
    expect(launches()).toBe(1);
  });

  it("refuses without a session, with another installation's session, or from another site", async () => {
    const { jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    expect((await post({ installationId: "i_1", repo: "luigi/demo" })).status).toBe(401);
    expect((await post({ installationId: "i_1", repo: "luigi/demo" }, { session: "i_2" })).status).toBe(401);
    expect((await post({ installationId: "i_1", repo: "luigi/demo" }, { session: "i_1", origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ installationId: "i_1" }, { session: "i_1" })).status).toBe(400);
    expect(launches()).toBe(0);
  });
});
