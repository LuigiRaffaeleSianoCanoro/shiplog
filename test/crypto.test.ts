import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { open, parseMasterKey, seal } from "@/lib/crypto";

describe("AES-256-GCM key encryption", () => {
  const master = randomBytes(32);
  it("round-trips and uses a fresh IV each time", () => {
    const a = seal("key_secret_1234", master, "i_1"), b = seal("key_secret_1234", master, "i_1");
    expect(a.iv).not.toBe(b.iv); expect(a.ciphertext).not.toContain("secret");
    expect(open(a, master, "i_1")).toBe("key_secret_1234");
  });
  it("fails with wrong installation (AAD) or tampered data", () => {
    const s = seal("k", master, "i_1");
    expect(() => open(s, master, "i_2")).toThrow();
    expect(() => open({ ...s, tag: Buffer.alloc(16).toString("base64") }, master, "i_1")).toThrow();
  });
  it("parses base64 and hex master keys, rejects wrong length", () => {
    expect(parseMasterKey(master.toString("base64")).equals(master)).toBe(true);
    expect(parseMasterKey(master.toString("hex")).equals(master)).toBe(true);
    expect(() => parseMasterKey("short")).toThrow();
  });
});
