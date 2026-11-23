import { headers } from "next/headers";

const DEFAULT_PUBLIC_ORIGIN = "https://shiplog-luigi-canoros-projects.vercel.app";

/** Canonical public origin without reading request headers (ISR-safe). */
export function publicSiteOrigin(fallback = DEFAULT_PUBLIC_ORIGIN): string {
  const install = process.env.SHIPLOG_INSTALL_ORIGIN?.replace(/\/+$/, "");
  if (install) return install;
  const url = process.env.VERCEL_URL?.replace(/\/+$/, "");
  if (url) return `https://${url}`;
  return fallback;
}

/** Public site origin for the current request (feeds and canonical links). */
export async function requestOrigin(fallback = DEFAULT_PUBLIC_ORIGIN) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return fallback.replace(/\/+$/, "");
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/+$/, "");
}
