import { createPublicKey, verify, type JsonWebKeyInput } from "node:crypto";
import { fetchJwks } from "./webhook";

export interface Receipt { sub: string; aud: string; iss: string; exp: number; namespace_id?: string; state?: string; installedBy?: { id: string; email?: string; displayName?: string } }
type Jwk = JsonWebKeyInput["key"] & { kid?: string };

/**
 * Verify the installation_receipt JWT Origin appends to the install callback.
 * EdDSA, typ origin-installation-receipt+jwt, key by kid from JWKS, iss/aud/exp checked. sub = installation id.
 */
export async function verifyReceipt(jwt: string, appId: string, getKeys: (force?: boolean) => Promise<Jwk[]> = (f) => fetchJwks(undefined, f) as Promise<Jwk[]>, nowSec = Math.floor(Date.now() / 1000)): Promise<Receipt> {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("malformed receipt");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Receipt;
  if (header.alg !== "EdDSA" || header.typ !== "origin-installation-receipt+jwt") throw new Error("bad receipt header");
  const find = (keys: Jwk[]) => keys.find((k) => k.kid === header.kid);
  const jwk = find(await getKeys(false)) ?? find(await getKeys(true));
  if (!jwk) throw new Error("unknown receipt key");
  const ok = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  if (!ok) throw new Error("bad receipt signature");
  if (claims.iss !== "https://api.cursor.com/v1/origin") throw new Error("bad iss");
  if (appId && claims.aud !== appId) throw new Error("bad aud");
  if (!claims.exp || claims.exp < nowSec) throw new Error("receipt expired");
  if (!claims.sub) throw new Error("missing sub");
  return claims;
}
