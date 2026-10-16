import { describe, expect, it } from "vitest";
process.env.SHIPLOG_KEY_ENC = Buffer.alloc(32, 7).toString("base64");
const { signSession, readSession } = await import("@/lib/session");
describe("install session cookie", () => {
  it("round-trips, rejects tampering and expiry", () => {
    const c = signSession("i_1", 60, 0);
    expect(readSession(c, 1000)).toBe("i_1");
    expect(readSession(c.replace("i_1", "i_2"), 1000)).toBeNull();
    expect(readSession(c, 61_000)).toBeNull();
  });
});
