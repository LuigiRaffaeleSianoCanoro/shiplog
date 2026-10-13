import { createHash, createPublicKey, verify, type JsonWebKeyInput } from "node:crypto";

type Jwk = JsonWebKeyInput["key"];
let cache: { keys: Jwk[]; at: number } | null = null;

export async function fetchJwks(url = process.env.ORIGIN_JWKS_URL ?? "https://api.cursor.com/v1/origin/keys", force = false): Promise<Jwk[]> {
  if (!force && cache && Date.now() - cache.at < 600_000) return cache.keys;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`jwks ${r.status}`);
    const { keys } = (await r.json()) as { keys: Jwk[] };
    cache = { keys, at: Date.now() };
    return keys;
  } catch (e) {
    if (cache && Date.now() - cache.at < 1_200_000) return cache.keys; // stale-if-error
    throw e;
  }
}

export function digestFor(id: string, ts: number, body: Buffer | string) {
  return createHash("sha256").update(`${id}.${ts}.`).update(body).digest("hex");
}

/**
 * Origin webhook verification (v1ed): Ed25519 over lowercase hex SHA-256("<id>.<ts>.<raw body>").
 * Rejects timestamps more than 5 minutes off. Tries every active JWKS key.
 */
export async function verifyOriginWebhook(
  body: Buffer,
  headers: { get(name: string): string | null },
  getKeys: (force?: boolean) => Promise<Jwk[]> = (f) => fetchJwks(undefined, f),
  nowSec = Math.floor(Date.now() / 1000),
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const id = headers.get("webhook-id");
  const ts = Number(headers.get("webhook-timestamp"));
  const sig = headers.get("webhook-signature")?.split(/\s+/).find((v) => v.startsWith("v1ed,"));
  if (!id || !sig || !Number.isInteger(ts)) return { ok: false, reason: "missing headers" };
  if (Math.abs(nowSec - ts) > 300) return { ok: false, reason: "stale timestamp" };
  const digest = Buffer.from(digestFor(id, ts, body));
  const sigBuf = Buffer.from(sig.slice(5), "base64");
  const check = (keys: Jwk[]) =>
    keys.some((jwk) => {
      try { return verify(null, digest, createPublicKey({ key: jwk, format: "jwk" }), sigBuf); } catch { return false; }
    });
  if (check(await getKeys(false))) return { ok: true, id };
  if (check(await getKeys(true))) return { ok: true, id }; // key rotated
  return { ok: false, reason: "bad signature" };
}
