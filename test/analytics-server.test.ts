import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("server analytics", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  afterEach(async () => {
    const { resetAnalyticsForTests } = await import("@/lib/analytics/server");
    resetAnalyticsForTests();
  });

  it("no-ops capture when PostHog is not configured", async () => {
    const { captureServerEvent, flushServerAnalytics } = await import("@/lib/analytics/server");
    await expect(captureServerEvent("test_event", { ok: true })).resolves.toBeUndefined();
    await expect(flushServerAnalytics()).resolves.toBeUndefined();
  });

  it("records events through a test sink", async () => {
    const events: { name: string; props: Record<string, unknown> }[] = [];
    const { setAnalyticsSinkForTests, captureServerEvent, captureServerException } = await import("@/lib/analytics/server");
    setAnalyticsSinkForTests({
      capture: (name, props) => events.push({ name, props: props ?? {} }),
      captureException: (err, props) => events.push({ name: "$exception", props: { message: err.message, ...props } }),
      flush: async () => {},
      shutdown: async () => {},
    });
    await captureServerEvent("installation_created", { provider: "origin" });
    await captureServerException(new Error("boom"), { route: "/api/x" });
    expect(events).toEqual([
      { name: "installation_created", props: { provider: "origin" } },
      { name: "$exception", props: { message: "boom", route: "/api/x" } },
    ]);
  });
});
