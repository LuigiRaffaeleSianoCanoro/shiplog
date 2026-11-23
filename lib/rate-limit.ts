/**
 * Best-effort per-IP rate limits for the public read API and MCP.
 * Counters live in the function instance's memory, so the effective limit is per instance.
 * Use a Vercel Firewall rule when you need one global limit.
 */

export type HitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }: { limit: number; windowMs: number; maxKeys?: number; now?: () => number }) {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key: string): HitResult {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        windows.delete(key);
        w = { start: t, count: 0 };
        windows.set(key, w);
        while (windows.size > maxKeys) windows.delete(windows.keys().next().value as string);
      }
      if (w.count >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) };
      w.count++;
      return { ok: true };
    },
    size: () => windows.size,
  };
}

/** Vercel sets x-real-ip and x-forwarded-for to the client address. */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const BUCKETS = {
  api: { env: "SHIPLOG_RATE_LIMIT_API", fallback: 120 },
  mcp: { env: "SHIPLOG_RATE_LIMIT_MCP", fallback: 60 },
} as const;
export type Bucket = keyof typeof BUCKETS;

/** Requests per minute per IP. "0" turns the limit off; unset or invalid uses the default. */
function limitFor(bucket: Bucket): number {
  const raw = bucket === "api" ? process.env.SHIPLOG_RATE_LIMIT_API : process.env.SHIPLOG_RATE_LIMIT_MCP;
  const n = raw != null && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : BUCKETS[bucket].fallback;
  return n;
}

const limiters = new Map<string, ReturnType<typeof createRateLimiter>>();

/** A 429 response when this IP spent its budget for the bucket, else null. */
export function rateLimited(req: Request, bucket: Bucket, extraHeaders: Record<string, string> = {}): Response | null {
  const limit = limitFor(bucket);
  if (limit === 0) return null;
  const id = `${bucket}:${limit}`;
  let rl = limiters.get(id);
  if (!rl) limiters.set(id, (rl = createRateLimiter({ limit, windowMs: 60_000 })));
  const r = rl.hit(clientIp(req));
  if (r.ok) return null;
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": String(r.retryAfterSec), ...extraHeaders },
  });
}
