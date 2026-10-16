import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface Sealed { ciphertext: string; iv: string; tag: string; keyVersion: number }

/** Master key: 32 bytes, base64 or hex encoded. */
export function parseMasterKey(raw: string): Buffer {
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("SHIPLOG_KEY_ENC must be 32 bytes (base64 or hex)");
  return k;
}

/** AES-256-GCM with a random 12-byte IV per record; installation id bound as AAD. */
export function seal(plaintext: string, master: Buffer, aad: string, keyVersion = 1): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", master, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), keyVersion };
}

export function open(s: Sealed, master: Buffer, aad: string): string {
  const d = createDecipheriv("aes-256-gcm", master, Buffer.from(s.iv, "base64"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(s.ciphertext, "base64")), d.final()]).toString("utf8");
}

export const last4 = (k: string) => k.slice(-4);

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string) {
  const h = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(h(a), h(b));
}
