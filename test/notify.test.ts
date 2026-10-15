import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDiscordBody,
  buildGenericBody,
  buildSlackBody,
  classifyWebhookUrl,
  dedupeWebhooks,
  isValidNotifyWebhookUrl,
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
    const f = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await notifyWebhooks([slack, generic], payload);
    expect(f).toHaveBeenCalledTimes(2);
    const bodies = f.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(bodies[0]).toHaveProperty("text");
    expect(bodies[1].event).toBe("changelog_entry");
  });

  it("does not throw when a webhook fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(notifyWebhooks(["https://example.com/bad"], payload)).resolves.toBeUndefined();
    expect(err.mock.calls[0]?.[0]).toMatch(/notify webhook failed/);
    expect(String(err.mock.calls[0]?.[1])).toContain("example.com");
    expect(String(err.mock.calls[0]?.[1])).not.toContain("secret=abc");
  });

  it("skips invalid URLs without calling fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await notifyWebhooks(["ftp://x", "https://good.example/h"], payload);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
