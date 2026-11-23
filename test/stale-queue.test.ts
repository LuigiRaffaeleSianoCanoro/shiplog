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
  vi.stubEnv("SHIPLOG_DATA_FILE", `/tmp/shiplog-stale-${Math.random()}.json`);
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

describe("stale batch queue recovery", () => {
  it("leaves a fresh queue alone", async () => {
    const { jobs, comments } = await setup("batch: release\n");
    await queueTwo(jobs);
    const before = comments.length;
    expect(await jobs.recoverStaleQueue(new Date(Date.now() + 5 * DAY))).toEqual({ recovered: 0, reminded: 0 });
    expect(comments.length).toBe(before);
  });

  it("with a key and batch: release, reminds once on the newest PR, spends nothing, and keeps the PRs queued", async () => {
    const { store, jobs, comments, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    const later = new Date(Date.now() + 15 * DAY);
    expect(await jobs.recoverStaleQueue(later)).toEqual({ recovered: 0, reminded: 2 });
    const reminder = comments.at(-1)!;
    expect(reminder.pr).toBe("41");
    expect(reminder.body).toContain("2 merged PRs (#40, #41) have been waiting");
    expect(reminder.body).toContain("/shiplog release");
    expect(launches()).toBe(0);
    expect((await store.listJobs()).filter((j: any) => j.status === "queued")).toHaveLength(2);
    // Idempotent: the next cron run does not remind again.
    const n = comments.length;
    expect(await jobs.recoverStaleQueue(new Date(later.getTime() + DAY))).toEqual({ recovered: 0, reminded: 0 });
    expect(comments.length).toBe(n);
  });

  it("a later release still batches reminded PRs", async () => {
    const { store, jobs, launches } = await setup("batch: release\n");
    await queueTwo(jobs);
    await jobs.recoverStaleQueue(new Date(Date.now() + 15 * DAY));
    await jobs.handleEvent({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "41", repository }, comment: { body: "/shiplog release v1.1.0", author: { user: { id: "u" } } } } } }, "rel");
    expect(launches()).toBe(1);
    expect((await store.listJobs()).filter((j: any) => j.status === "queued")).toHaveLength(0);
  });

  it("when the key was removed, posts the batch as a ready-to-run prompt and closes the queue", async () => {
    const { store, jobs, comments, launches } = await setup("batch: daily\n");
    await queueTwo(jobs);
    await store.deleteKey("i_1");
    expect(await jobs.flushBatches()).toBe(0); // stuck: daily flush needs a key
    expect(await jobs.recoverStaleQueue(new Date(Date.now() + 15 * DAY))).toEqual({ recovered: 2, reminded: 0 });
    const c = comments.at(-1)!;
    expect(c.pr).toBe("41");
    expect(c.body).toContain("no Cursor key connected");
    expect(c.body).toContain(`number="40"`);
    expect(c.body).toContain(`number="41"`);
    expect(launches()).toBe(0);
    const done = (await store.listJobs()).filter((j: any) => j.prNumber === "40" || j.prNumber === "41");
    expect(done.map((j: any) => j.status)).toEqual(["done", "done"]);
    expect(done[0].result).toMatch(/^recovered: prompt posted on #41/);
    expect(await jobs.recoverStaleQueue(new Date(Date.now() + 16 * DAY))).toEqual({ recovered: 0, reminded: 0 });
  });

  it("a daily batch that keeps failing with a key gets a check-your-key reminder, not a release hint", async () => {
    const { jobs, comments } = await setup("batch: daily\n");
    await queueTwo(jobs);
    expect((await jobs.recoverStaleQueue(new Date(Date.now() + 15 * DAY))).reminded).toBe(2);
    expect(comments.at(-1)!.body).toContain("waiting for the daily batch");
    expect(comments.at(-1)!.body).not.toContain("/shiplog release");
  });

  it("SHIPLOG_QUEUE_STALE_DAYS sets the age, and 0 turns recovery off", async () => {
    const { jobs } = await setup("batch: release\n");
    await queueTwo(jobs);
    vi.stubEnv("SHIPLOG_QUEUE_STALE_DAYS", "3");
    expect((await jobs.recoverStaleQueue(new Date(Date.now() + 2 * DAY))).reminded).toBe(0);
    vi.stubEnv("SHIPLOG_QUEUE_STALE_DAYS", "0");
    expect((await jobs.recoverStaleQueue(new Date(Date.now() + 90 * DAY))).reminded).toBe(0);
    vi.stubEnv("SHIPLOG_QUEUE_STALE_DAYS", "3");
    expect((await jobs.recoverStaleQueue(new Date(Date.now() + 4 * DAY))).reminded).toBe(2);
  });

  it("the cron poll reports recovery counts", async () => {
    const { jobs } = await setup("batch: release\n");
    await queueTwo(jobs);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 15 * DAY));
    const { runCronPoll } = await import("@/lib/cronPoll");
    expect(await runCronPoll()).toMatchObject({ batches: 0, stale: { recovered: 0, reminded: 2 } });
  });
});
