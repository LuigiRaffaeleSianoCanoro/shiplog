import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDiscordBody,
  buildGenericBody,
  buildSlackBody,
  classifyWebhookUrl,
  dedupeWebhooks,
  isRetryableNotifyStatus,
  isValidNotifyWebhookUrl,
  notifyRetryDelayMs,
  NOTIFY_WEBHOOK_MAX_ATTEMPTS,
  notifyWebhooks,
  redactWebhookUrl,
  type NotifyPayload,
} from "@/lib/notify";

const payload: NotifyPayload = {
  event: "changelog_entry",
  repo: "luigi/demo",
  prNumber: "42",
  prUrl: "https://cursor.com/codebase/luigi/demo/pull/42",
  title: "feat: dark mode",
  detail: "### Added\n- Dark mode toggle (#42)",
};

describe("notify webhook URLs", () => {
  it("accepts https Slack, Discord, and generic URLs", () => {
    expect(isValidNotifyWebhookUrl("https://hooks.slack.com/services/T/B/x")).toBe(true);
    expect(isValidNotifyWebhookUrl("https://discord.com/api/webhooks/1/abc")).toBe(true);
    expect(isValidNotifyWebhookUrl("https://example.com/hooks/shiplog")).toBe(true);
    expect(isValidNotifyWebhookUrl("http://hooks.slack.com/x")).toBe(false);
    expect(isValidNotifyWebhookUrl("not-a-url")).toBe(false);
    expect(isValidNotifyWebhookUrl("")).toBe(false);
  });

  it("allows loopback http when SHIPLOG_ALLOW_HTTP_NOTIFY is set", () => {
    process.env.SHIPLOG_ALLOW_HTTP_NOTIFY = "true";
    expect(isValidNotifyWebhookUrl("http://127.0.0.1:4567/notify/capture")).toBe(true);
    expect(isValidNotifyWebhookUrl("http://evil.com/hook")).toBe(false);
    delete process.env.SHIPLOG_ALLOW_HTTP_NOTIFY;
  });

  it("classifies provider from host", () => {
    expect(classifyWebhookUrl("https://hooks.slack.com/services/x")).toBe("slack");
    expect(classifyWebhookUrl("https://discord.com/api/webhooks/1/x")).toBe("discord");
    expect(classifyWebhookUrl("https://discordapp.com/api/webhooks/1/x")).toBe("discord");
    expect(classifyWebhookUrl("https://notify.example.com/x")).toBe("generic");
  });

  it("redacts query strings for logs", () => {
    expect(redactWebhookUrl("https://example.com/hook?token=secret&x=1")).toBe("https://example.com/hook?…");
    expect(redactWebhookUrl("https://hooks.slack.com/services/A/B/C")).toBe("https://hooks.slack.com/services/A/B/C");
  });

  it("dedupes valid URLs", () => {
    const a = "https://hooks.slack.com/services/T/B/x";
    expect(dedupeWebhooks([a, a, "bad", "https://example.com/y"])).toEqual([a, "https://example.com/y"]);
  });
});

describe("payload shaping", () => {
  it("formats Slack text", () => {
    const body = buildSlackBody(payload);
    expect(body.text).toContain("luigi/demo");
    expect(body.text).toContain("#42");
    expect(body.text).toContain("Dark mode");
  });

  it("formats Discord content", () => {
    const body = buildDiscordBody(payload);
    expect(body.content).toContain("**Shiplog**");
    expect(body.content).toContain("changelog");
  });

  it("formats generic JSON", () => {
    const body = buildGenericBody({ ...payload, event: "release_cut", version: "1.0.0", prNumber: "", prUrl: "" });
    expect(body.event).toBe("release_cut");
    expect(body.version).toBe("1.0.0");
    expect(body.repo).toBe("luigi/demo");
  });
});

describe("notifyWebhooks delivery", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs Slack and generic bodies to each URL", async () => {
    const slack = "https://hooks.slack.com/services/T/B/x";
    const generic = "https://example.com/notify";
    const f = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response("", { status: 200 }),
    );
    vi.stubGlobal("fetch", f);
    await notifyWebhooks([slack, generic], payload);
    expect(f).toHaveBeenCalledTimes(2);
    const bodies = f.mock.calls.map((c) => JSON.parse(String(c[1]?.body)));
    expect(bodies[0]).toHaveProperty("text");
    expect(bodies[1].event).toBe("changelog_entry");
  });

  it("does not throw when a webhook fails after retries", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    const f = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", f);
    const p = notifyWebhooks(["https://example.com/bad?secret=abc"], payload);
    await vi.runAllTimersAsync();
    await p;
    expect(f).toHaveBeenCalledTimes(NOTIFY_WEBHOOK_MAX_ATTEMPTS);
    expect(err.mock.calls.length).toBeGreaterThanOrEqual(NOTIFY_WEBHOOK_MAX_ATTEMPTS);
    const lines = err.mock.calls.map((c) => String(c[0]));
    expect(lines.every((l) => l.includes("notify webhook attempt"))).toBe(true);
    const parsed = lines.map((l) => JSON.parse(l.replace(/^\[shiplog\] notify webhook attempt /, "")));
    expect(parsed.every((j) => !JSON.stringify(j).includes("secret=abc"))).toBe(true);
    expect(parsed[0]?.url).toContain("example.com");
    vi.useRealTimers();
  });

  it("retries transient 5xx then succeeds without extra attempts", async () => {
    vi.useFakeTimers();
    let n = 0;
    const f = vi.fn(async () => {
      n++;
      return new Response(n < 2 ? "err" : "ok", { status: n < 2 ? 503 : 200 });
    });
    vi.stubGlobal("fetch", f);
    const p = notifyWebhooks(["https://example.com/hook"], payload);
    await vi.runAllTimersAsync();
    await p;
    expect(f).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry permanent 4xx except 408 and 429", async () => {
    vi.useFakeTimers();
    const f404 = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", f404);
    let p = notifyWebhooks(["https://example.com/missing"], payload);
    await vi.runAllTimersAsync();
    await p;
    expect(f404).toHaveBeenCalledTimes(1);

    const f401 = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", f401);
    p = notifyWebhooks(["https://example.com/unauth"], payload);
    await vi.runAllTimersAsync();
    await p;
    expect(f401).toHaveBeenCalledTimes(1);

    let n = 0;
    const f429 = vi.fn(async () => {
      n++;
      return new Response("", { status: 429, headers: { "Retry-After": "1" } });
    });
    vi.stubGlobal("fetch", f429);
    p = notifyWebhooks(["https://example.com/limit"], payload);
    await vi.runAllTimersAsync();
    await p;
    expect(f429).toHaveBeenCalledTimes(NOTIFY_WEBHOOK_MAX_ATTEMPTS);
    vi.useRealTimers();
  });

  it("retries network errors", async () => {
    vi.useFakeTimers();
    let n = 0;
    const f = vi.fn(async () => {
      n++;
      if (n < 3) throw new TypeError("fetch failed");
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    const p = notifyWebhooks(["https://example.com/net"], payload);
    await vi.runAllTimersAsync();
    await p;
    expect(f).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

});

describe("notify retry helpers", () => {
  it("classifies retryable HTTP statuses", () => {
    expect(isRetryableNotifyStatus(500)).toBe(true);
    expect(isRetryableNotifyStatus(503)).toBe(true);
    expect(isRetryableNotifyStatus(429)).toBe(true);
    expect(isRetryableNotifyStatus(408)).toBe(true);
    expect(isRetryableNotifyStatus(404)).toBe(false);
    expect(isRetryableNotifyStatus(400)).toBe(false);
    expect(isRetryableNotifyStatus(401)).toBe(false);
  });

  it("computes backoff with jitter and honors Retry-After cap", () => {
    const d1 = notifyRetryDelayMs(1, null, () => 0.5);
    expect(d1).toBeGreaterThanOrEqual(200);
    expect(d1).toBeLessThanOrEqual(800);
    expect(notifyRetryDelayMs(1, "2", () => 0)).toBe(2000);
    expect(notifyRetryDelayMs(1, "120", () => 0)).toBeLessThanOrEqual(10_000);
  });
});

describe("notifyWebhooks delivery (continued)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("skips invalid URLs without calling fetch", async () => {
    const f = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await notifyWebhooks(["ftp://x", "https://good.example/h"], payload);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
