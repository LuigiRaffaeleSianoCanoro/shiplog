import { describe, expect, it } from "vitest";
import { safeEqual } from "@/lib/crypto";
describe("safeEqual", () => {
  it("compares in constant time without throwing on length mismatch", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
describe("cron auth", () => {
  it("fails closed when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("@/app/api/cron/poll/route");
    expect((await GET(new Request("https://x/api/cron/poll"))).status).toBe(401);
  });
});
