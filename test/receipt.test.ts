import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyReceipt } from "@/lib/receipt";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwk = { ...(publicKey.export({ format: "jwk" }) as any), kid: "k1" };
const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = 1_800_000_000;
function mk(claims: object, header: object = { alg: "EdDSA", typ: "origin-installation-receipt+jwt", kid: "k1" }, key = privateKey) {
  const si = `${b(header)}.${b(claims)}`;
  return `${si}.${sign(null, Buffer.from(si), key).toString("base64url")}`;
}
const good = { iss: "https://api.cursor.com/v1/origin", aud: "app_1", sub: "i_42", exp: now + 60 };
const keys = async () => [jwk];

describe("installation receipt", () => {
  it("verifies and returns sub as installation id", async () => {
    expect((await verifyReceipt(mk(good), "app_1", keys, now)).sub).toBe("i_42");
  });
  it("rejects wrong aud, expired, wrong typ, forged signature", async () => {
    await expect(verifyReceipt(mk({ ...good, aud: "app_2" }), "app_1", keys, now)).rejects.toThrow("aud");
    await expect(verifyReceipt(mk({ ...good, exp: now - 1 }), "app_1", keys, now)).rejects.toThrow("expired");
    await expect(verifyReceipt(mk(good, { alg: "EdDSA", typ: "JWT", kid: "k1" }), "app_1", keys, now)).rejects.toThrow("header");
    await expect(verifyReceipt(mk(good, undefined, generateKeyPairSync("ed25519").privateKey), "app_1", keys, now)).rejects.toThrow("signature");
  });
});
