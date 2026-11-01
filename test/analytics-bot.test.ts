import { describe, expect, it } from "vitest";
import { isLikelyBotUserAgent } from "@/lib/analytics/bot";

describe("isLikelyBotUserAgent", () => {
  it("treats missing user agent as non-bot", () => {
    expect(isLikelyBotUserAgent(null)).toBe(false);
    expect(isLikelyBotUserAgent("")).toBe(false);
  });

  it("flags common crawlers and preview bots", () => {
    expect(isLikelyBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isLikelyBotUserAgent("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")).toBe(true);
    expect(isLikelyBotUserAgent("curl/8.5.0")).toBe(true);
  });

  it("allows normal browsers", () => {
    expect(
      isLikelyBotUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});
