import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** Signed, httpOnly cookie proving the browser came through a verified installation receipt. */
export const COOKIE = "shiplog_inst";
const mac = (v: string) => createHmac("sha256", `session:${env.encKey}`).update(v).digest("base64url");
export function signSession(installationId: string, ttlSec = 3600, now = Date.now()) {
  const v = `${installationId}.${Math.floor(now / 1000) + ttlSec}`;
  return `${v}.${mac(v)}`;
}
export function readSession(cookie: string | undefined, now = Date.now()): string | null {
  if (!cookie || !env.encKey) return null;
  const i = cookie.lastIndexOf("."); if (i < 0) return null;
  const v = cookie.slice(0, i), sig = Buffer.from(cookie.slice(i + 1)), want = Buffer.from(mac(v));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  const j = v.lastIndexOf("."); const exp = Number(v.slice(j + 1));
  if (!(exp * 1000 > now)) return null;
  return v.slice(0, j);
}
