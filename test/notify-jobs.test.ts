import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

const master = randomBytes(32).toString("base64");
const slack = "https://hooks.slack.com/services/T/B/x";

async function setup(envOver: Record<string, string> = {}) {
  vi.resetModules();
  for (const k of ["SHIPLOG_LLM_PROVIDER", "SHIPLOG_BYOK_ENABLED", "SUPABASE_URL", "ORIGIN_APP_ID", "ORIGIN_APP_PRIVATE_KEY"]) delete process.env[k];
  Object.assign(process.env, { SHIPLOG_KEY_ENC: master, ...envOver });
  const { MemoryStore } = await import("@/lib/store/memory");
  const storeMod = await import("@/lib/store");
  const store = new MemoryStore();
  storeMod.setStore(store);
  const jobs = await import("@/lib/jobs");
  return { store, jobs };
}

describe("user notify webhooks in jobs", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("POSTs on neon changelog and release without failing the job when webhook errors", async () => {
    const { store, jobs } = await setup({ SHIPLOG_LLM_PROVIDER: "neon", NEON_AI_GATEWAY_BASE_URL: "https://gw.test", NEON_AI_GATEWAY_TOKEN: "t" });
    await store.upsertInstallation({ id: "i_1", namespace: "luigi", status: "active", createdAt: new Date().toISOString() });
    await store.putNotifyWebhooks("i_1", [slack]);
    const replies = [JSON.stringify({ section: "Added", bullet: "Widgets" }), "Widget release."];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === slack) return new Response("fail", { status: 500 });
      return new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] }));
    });
    vi.stubGlobal("fetch", f);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const merged = { installationId: "i_1", event: { type: "pull_request.merged", payload: { pullRequest: { number: "3", title: "feat: widgets", body: "", webUrl: "https://cursor.com/codebase/luigi/demo/pull/3" }, repository: { name: "demo", owner: { slug: "luigi" } } } } };
    const job = await jobs.handleEvent(merged, "n1");
    expect(job?.status).toBe("done");
    expect(f.mock.calls.some((c) => c[0] === slack)).toBe(true);
    const slackBody = JSON.parse(String(f.mock.calls.find((c) => c[0] === slack)?.[1]?.body));
    expect(slackBody.text).toContain("Widgets");
    expect(err.mock.calls.some((c) => String(c[0]).includes("notify webhook failed"))).toBe(true);

    await store.upsertInstallation({ ...(await store.getInstallation("i_1"))!, installerId: "u" });
    const rel = await jobs.handleEvent({ installationId: "i_1", event: { type: "pull_request.comment.created", payload: { pullRequest: { number: "3", repository: { name: "demo", owner: { slug: "luigi" } } }, comment: { body: "/shiplog release v2.0.0", author: { user: { id: "u" } } } } } }, "n2");
    expect(rel?.status).toBe("done");
    expect(f.mock.calls.filter((c) => c[0] === slack).length).toBeGreaterThanOrEqual(2);
    vi.unstubAllGlobals();
  });
});
