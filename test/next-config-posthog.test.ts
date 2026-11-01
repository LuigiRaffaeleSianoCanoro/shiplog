import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("next.config PostHog proxy", () => {
  it("rewrites /ingest to the configured PostHog host", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
    const rewrites = await config.rewrites!();
    const list = Array.isArray(rewrites) ? rewrites : rewrites.beforeFiles ?? [];
    expect(list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "/ingest/static/:path*", destination: "https://us.i.posthog.com/static/:path*" }),
        expect.objectContaining({ source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" }),
      ]),
    );
  });
});
