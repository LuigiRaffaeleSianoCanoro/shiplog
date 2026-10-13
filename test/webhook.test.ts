import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { digestFor, verifyOriginWebhook } from "@/lib/webhook";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const other = generateKeyPairSync("ed25519");
const jwk = publicKey.export({ format: "jwk" }) as any;
const now = 1_800_000_000;
function headers(id: string, ts: number, body: string, key = privateKey) {
  const sig = sign(null, Buffer.from(digestFor(id, ts, body)), key).toString("base64");
  return new Headers({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1ed,${sig}` });
}
const keys = async () => [jwk];

describe("Origin webhook verification", () => {
  const body = JSON.stringify({ event: { type: "pull_request.merged" } });
  it("accepts a valid signature", async () => {
    expect(await verifyOriginWebhook(Buffer.from(body), headers("whd_1", now, body), keys, now)).toEqual({ ok: true, id: "whd_1" });
  });
  it("rejects a tampered body", async () => {
    const r = await verifyOriginWebhook(Buffer.from(body + " "), headers("whd_1", now, body), keys, now);
    expect(r.ok).toBe(false);
  });
  it("rejects timestamps older than 5 minutes", async () => {
    const r = await verifyOriginWebhook(Buffer.from(body), headers("whd_1", now - 301, body), keys, now);
    expect(r).toEqual({ ok: false, reason: "stale timestamp" });
  });
  it("rejects a signature from an unknown key, after a forced JWKS refresh", async () => {
    let forced = false;
    const r = await verifyOriginWebhook(Buffer.from(body), headers("whd_1", now, body, other.privateKey), async (f) => { if (f) forced = true; return [jwk]; }, now);
    expect(r.ok).toBe(false); expect(forced).toBe(true);
  });
  it("rejects missing headers", async () => {
    expect((await verifyOriginWebhook(Buffer.from(body), new Headers(), keys, now)).ok).toBe(false);
  });
});
