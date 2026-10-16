import { headers } from "next/headers";

/** Public site origin for the current request (feeds and canonical links). */
export async function requestOrigin(fallback = "https://shiplog-luigi-canoros-projects.vercel.app") {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return fallback.replace(/\/+$/, "");
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/+$/, "");
}
