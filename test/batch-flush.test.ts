import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { COOKIE } from "@/lib/session";
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
    expect(r).toEqual({ status: "launched", agentRuns: 1, prs: 2, failedRuns: 0 });
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

  it("a double click (two flushes at once) launches one agent", async () => {
    const { jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    const [a, b] = await Promise.all([jobs.flushRepoNow("i_1", "luigi/demo"), jobs.flushRepoNow("i_1", "luigi/demo")]);
    expect(launches()).toBe(1);
    expect([a.status, b.status].sort()).toEqual(["busy", "launched"].sort());
  });

  it("the daily cron and a click at the same time launch one agent", async () => {
    const { jobs, launches } = await setup("batch: daily\n");
    await queueTwo(jobs);
    const { runCronPoll } = await import("@/lib/cronPoll");
    const [cron, click] = await Promise.all([runCronPoll(), jobs.flushRepoNow("i_1", "luigi/demo")]);
    expect(launches()).toBe(1);
    expect(cron.skipped === true || click.status === "busy").toBe(true);
  });

  it("an abandoned lock (crashed flush) expires instead of wedging the repo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { store, jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    expect(await store.acquireCronPollLock(120_000)).toBe(true); // a flush that never released
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toEqual({ status: "busy" });
    vi.setSystemTime(Date.now() + 121_000);
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toMatchObject({ status: "launched" });
    expect(launches()).toBe(1);
  });

  it("a failed launch reports failed, keeps the PRs queued, and the next click can retry", async () => {
    const { store, jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    const f = globalThis.fetch as any;
    const ok = f.getMockImplementation();
    f.mockImplementation(async (url: string, init?: any) => (String(url).endsWith("/v1/agents") ? new Response("boom", { status: 500 }) : ok(url, init)));
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toEqual({ status: "failed" });
    expect((await store.listJobs("i_1")).filter((j: any) => j.status === "queued")).toHaveLength(2);
    f.mockImplementation(ok);
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toMatchObject({ status: "launched", prs: 2 });
    expect(launches()).toBe(2); // one failed attempt, one real run
  });

  it("monorepo: one run per changelog file (default file included), and the preview promises the same number", async () => {
    const { store, jobs, launches } = await setup("batch: release\n");
    const q = (n: string, paths?: string[]) => ({ id: `m${n}`, deliveryId: `m${n}`, installationId: "i_1", repo: "luigi/demo", prNumber: n, prUrl: "", kind: "changelog" as const, mode: "cursor" as const, status: "queued" as const, createdAt: new Date().toISOString(),
      result: JSON.stringify({ number: n, url: "", title: `feat: ${n}`, body: "", section: null, breaking: false, batch: "release", ...(paths ? { changelogPaths: paths } : {}) }) });
    await store.putJob(q("1", ["packages/a/CHANGELOG.md", "packages/b/CHANGELOG.md"]));
    await store.putJob(q("2"));
    const { releasePreviews } = await import("@/lib/release-preview");
    const [p] = releasePreviews(await store.listJobs("i_1"), () => false);
    expect(p.changelogFiles).toHaveLength(3);
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toEqual({ status: "launched", agentRuns: 3, prs: 2, failedRuns: 0 });
    expect(launches()).toBe(3);
    expect(p.changelogFiles).toContain("default");
  });

  it("monorepo partial failure: the failed file stays queued and the retry runs only that file", async () => {
    const { store, jobs, launches } = await setup("batch: release\n");
    await store.putJob({ id: "m1", deliveryId: "m1", installationId: "i_1", repo: "luigi/demo", prNumber: "1", prUrl: "", kind: "changelog", mode: "cursor", status: "queued", createdAt: new Date().toISOString(),
      result: JSON.stringify({ number: "1", url: "", title: "feat: shared", body: "", section: null, breaking: false, batch: "release", changelogPaths: ["packages/a/CHANGELOG.md", "packages/b/CHANGELOG.md"] }) });
    const f = globalThis.fetch as any;
    const ok = f.getMockImplementation();
    f.mockImplementation(async (url: string, init?: any) => (String(url).endsWith("/v1/agents") && String(init?.body).includes("packages/b/CHANGELOG.md") ? new Response("boom", { status: 500 }) : ok(url, init)));
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toEqual({ status: "launched", agentRuns: 1, prs: 1, failedRuns: 1 });
    const left = (await store.listJobs("i_1")).find((j: any) => j.id === "m1")!;
    expect(left.status).toBe("queued");
    expect(JSON.parse(left.result!).changelogPaths).toEqual(["packages/b/CHANGELOG.md"]);
    f.mockImplementation(ok);
    const before = launches();
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toEqual({ status: "launched", agentRuns: 1, prs: 1, failedRuns: 0 });
    expect(launches() - before).toBe(1);
    const last = f.mock.calls.filter((c: any) => String(c[0]).endsWith("/v1/agents")).at(-1);
    expect(JSON.parse(last[1].body).prompt.text).toContain("packages/b/CHANGELOG.md");
    expect((await store.listJobs("i_1")).find((j: any) => j.id === "m1")!.status).toBe("done");
  });

  it("queued records from before the batch field was stored still flush", async () => {
    const { store, jobs } = await setup("batch: release\n");
    await store.putJob({ id: "old", deliveryId: "old", installationId: "i_1", repo: "luigi/demo", prNumber: "3", prUrl: "", kind: "changelog", mode: "cursor", status: "queued", createdAt: new Date().toISOString(),
      result: JSON.stringify({ number: "3", url: "", title: "feat: legacy", body: "", section: null, breaking: false }) });
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toMatchObject({ status: "launched", prs: 1 });
  });

  it("daily cron, monorepo: a PR in two package changelogs reaches both runs (regression)", async () => {
    const { store, jobs, launches } = await setup("batch: daily\n");
    await store.putJob({ id: "m1", deliveryId: "m1", installationId: "i_1", repo: "luigi/demo", prNumber: "1", prUrl: "", kind: "changelog", mode: "cursor", status: "queued", createdAt: new Date().toISOString(),
      result: JSON.stringify({ number: "1", url: "", title: "feat: shared", body: "", section: null, breaking: false, batch: "daily", changelogPaths: ["packages/a/CHANGELOG.md", "packages/b/CHANGELOG.md"] }) });
    expect(await jobs.flushBatches()).toBe(2);
    expect(launches()).toBe(2);
    const prompts = (globalThis.fetch as any).mock.calls.filter((c: any) => String(c[0]).endsWith("/v1/agents")).map((c: any) => JSON.parse(c[1].body).prompt.text as string);
    expect(prompts.every((t: string) => t.includes('<pr number="1"'))).toBe(true);
  });

  it("a queued record that is not a batch entry is never swept in", async () => {
    const { store, jobs, launches } = await setup("batch: release\n");
    await store.putJob({ id: "odd", deliveryId: "odd", installationId: "i_1", repo: "luigi/demo", prNumber: "9", prUrl: "", kind: "changelog", mode: "cursor", status: "queued", result: "not json", createdAt: new Date().toISOString() });
    expect(await jobs.flushRepoNow("i_1", "luigi/demo")).toEqual({ status: "empty" });
    expect(launches()).toBe(0);
    expect((await store.listJobs("i_1")).find((j: any) => j.id === "odd")!.status).toBe("queued");
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
  // The cookie jar is read per request, so one mocked module serves every session in a test.
  let cookie: string | undefined;
  beforeAll(() => { vi.doMock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === COOKIE && cookie ? { value: cookie } : undefined) }) })); });
  afterAll(() => { vi.doUnmock("next/headers"); });
  async function post(form: Record<string, string>, opts: { session?: string; origin?: string; headers?: Record<string, string>; url?: string } = {}) {
    const { signSession } = await import("@/lib/session");
    cookie = opts.session ? signSession(opts.session) : undefined;
    const { POST } = await import("@/app/api/batch/flush/route");
    return POST(new Request(opts.url ?? "http://localhost:3000/api/batch/flush", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(opts.origin ? { origin: opts.origin } : {}), ...opts.headers }, body: new URLSearchParams(form) }));
  }

  it("with the install session: flushes and redirects back to the dashboard with the result", async () => {
    const { jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    const res = await post({ installationId: "i_1", repo: "luigi/demo" }, { session: "i_1", origin: "http://localhost:3000" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")!.startsWith("/dashboard?")).toBe(true); // relative: can't point at another host
    const loc = new URL(res.headers.get("location")!, "http://localhost:3000");
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
    expect((await post({ installationId: "i_1", repo: "luigi/demo" }, { session: "i_1", origin: "null" })).status).toBe(403);
    expect((await post({ installationId: "i_1" }, { session: "i_1" })).status).toBe(400);
    expect(launches()).toBe(0);
  });

  it("behind a proxy: the Host the browser used is accepted; forged x-forwarded-host neither passes nor steers the redirect", async () => {
    const { jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    const ok = await post({ installationId: "i_1", repo: "luigi/demo" }, { session: "i_1", origin: "https://shiplog.example", url: "http://10.0.0.5:3000/api/batch/flush", headers: { host: "shiplog.example" } });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toMatch(/^\/dashboard\?/);
    expect(launches()).toBe(1);
    const forged = await post({ installationId: "i_1", repo: "luigi/demo" }, { session: "i_1", origin: "https://evil.example", headers: { host: "shiplog.example", "x-forwarded-host": "evil.example" } });
    expect(forged.status).toBe(403);
  });

  it("a disconnected installation launches nothing", async () => {
    const { store, jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    await store.upsertInstallation({ id: "i_1", namespace: "luigi", status: "disconnected", createdAt: "", installerId: "u" });
    expect((await post({ installationId: "i_1", repo: "luigi/demo" }, { session: "i_1" })).status).toBe(404);
    expect(launches()).toBe(0);
  });
});
