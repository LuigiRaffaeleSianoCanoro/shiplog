import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * GitHub webhook verification (HMAC SHA-256).
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGitHubWebhook(
  body: Buffer,
  headers: { get(name: string): string | null },
  secret: string,
): { ok: true; deliveryId: string } | { ok: false; reason: string } {
  const deliveryId = headers.get("x-github-delivery");
  const sig = headers.get("x-hub-signature-256");
  if (!deliveryId || !sig) return { ok: false, reason: "missing headers" };
  if (!sig.startsWith("sha256=")) return { ok: false, reason: "bad signature format" };
  if (!secret) return { ok: false, reason: "webhook secret not configured" };
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const got = sig.slice("sha256=".length);
  try {
    if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"))) {
      return { ok: false, reason: "bad signature" };
    }
  } catch {
    return { ok: false, reason: "bad signature" };
  }
  return { ok: true, deliveryId };
}
