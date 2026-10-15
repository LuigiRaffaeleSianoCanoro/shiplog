import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

const master = randomBytes(32).toString("base64");

async function setup() {
  vi.resetModules();
  delete process.env.CRON_SECRET;
  process.env.SHIPLOG_KEY_ENC = master;
  const { MemoryStore } = await import("@/lib/store/memory");
  const storeMod = await import("@/lib/store");
  const store = new MemoryStore();
  storeMod.setStore(store);
  return { store };
}

describe("cron poll auth", () => {
  it("rejects missing or wrong bearer token", async () => {
    const { authorizeCronRequest } = await import("@/lib/cronPoll");
    process.env.CRON_SECRET = "sekret";
    expect(authorizeCronRequest(new Request("https://x/api/cron/poll"))).toBe(false);
    expect(
      authorizeCronRequest(
        new Request("https://x/api/cron/poll", { headers: { authorization: "Bearer wrong" } }),
      ),
    ).toBe(false);
    expect(
      authorizeCronRequest(
        new Request("https://x/api/cron/poll", { headers: { authorization: "Bearer sekret" } }),
      ),
    ).toBe(true);
  });
});

describe("runCronPoll", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("skips work when a poll is already in progress", async () => {
    await setup();
    const { runCronPoll } = await import("@/lib/cronPoll");
    const jobs = await import("@/lib/jobs");
    const flush = vi.spyOn(jobs, "flushBatches").mockImplementation(() => new Promise(() => {}));
    const poll = vi.spyOn(jobs, "pollAgents").mockResolvedValue(0);

    void runCronPoll();
    await new Promise((r) => setTimeout(r, 5));
    const second = await runCronPoll();
    expect(second.skipped).toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(poll).not.toHaveBeenCalled();
    flush.mockRestore();
    poll.mockRestore();
  });

  it("runs flush and poll when the lock is free", async () => {
    await setup();
    const { runCronPoll } = await import("@/lib/cronPoll");
    const jobs = await import("@/lib/jobs");
    vi.spyOn(jobs, "flushBatches").mockResolvedValue(2);
    vi.spyOn(jobs, "pollAgents").mockResolvedValue(3);
    const r = await runCronPoll();
    expect(r).toEqual({ updated: 3, batches: 2 });
  });
});

describe("GET /api/cron/poll", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns 401 without a valid bearer", async () => {
    await setup();
    process.env.CRON_SECRET = "cron-test-secret";
    const { GET } = await import("@/app/api/cron/poll/route");
    expect((await GET(new Request("https://x/api/cron/poll"))).status).toBe(401);
  });

  it("returns poll results with authorization", async () => {
    await setup();
    process.env.CRON_SECRET = "cron-test-secret";
    const jobs = await import("@/lib/jobs");
    vi.spyOn(jobs, "flushBatches").mockResolvedValue(1);
    vi.spyOn(jobs, "pollAgents").mockResolvedValue(2);
    const { GET } = await import("@/app/api/cron/poll/route");
    const res = await GET(
      new Request("https://x/api/cron/poll", { headers: { authorization: "Bearer cron-test-secret" } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2, batches: 1 });
  });

  it("returns skipped when another poll holds the lock", async () => {
    await setup();
    process.env.CRON_SECRET = "cron-test-secret";
    const jobs = await import("@/lib/jobs");
    vi.spyOn(jobs, "flushBatches").mockImplementation(() => new Promise(() => {}));
    vi.spyOn(jobs, "pollAgents").mockResolvedValue(0);
    const { GET } = await import("@/app/api/cron/poll/route");
    void GET(new Request("https://x/api/cron/poll", { headers: { authorization: "Bearer cron-test-secret" } }));
    const res = await GET(
      new Request("https://x/api/cron/poll", { headers: { authorization: "Bearer cron-test-secret" } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: true, updated: 0, batches: 0 });
  });
});
