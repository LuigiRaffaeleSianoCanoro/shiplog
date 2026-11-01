/** Same rules as public changelog slugs (first segment must be alnum). */
const VALID_SEG = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const SKIP_PREFIXES = ["api", "_next", "brand", "dashboard", "privacy", "setup", "ingest"];

function segmentIsProbe(segment: string): boolean {
  if (/^wp-/i.test(segment)) return true;
  if (segment === ".env" || segment === ".git") return true;
  if (/\.php$/i.test(segment)) return true;
  if (/\.(env|git|sql|bak|old|swp)$/i.test(segment)) return true;
  return false;
}

/** True when middleware should 404 without hitting the app store. */
export function publicPathShouldReject(pathname: string): boolean {
  const raw = pathname.split("?")[0] ?? pathname;
  if (raw.includes("..")) return true;
  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  const [first, second] = parts;
  if (SKIP_PREFIXES.includes(first)) return false;
  if (first === "api") return false;
  if (segmentIsProbe(first) || segmentIsProbe(second)) return true;
  if (!VALID_SEG.test(first) || !VALID_SEG.test(second)) return true;
  for (const seg of parts.slice(0, 2)) {
    if (seg.startsWith(".")) return true;
  }
  return false;
}
