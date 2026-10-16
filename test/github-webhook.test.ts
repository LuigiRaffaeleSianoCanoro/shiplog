import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyGitHubWebhook } from "@/lib/github-webhook";

const secret = "test-webhook-secret";
function sign(body: string, s = secret) {
  const hex = createHmac("sha256", s).update(body).digest("hex");
  return new Headers({
    "x-github-delivery": "ghd_1",
    "x-hub-signature-256": `sha256=${hex}`,
  });
}

describe("GitHub webhook verification", () => {
  const body = JSON.stringify({ zen: "test" });
  it("accepts a valid signature", () => {
    expect(verifyGitHubWebhook(Buffer.from(body), sign(body), secret)).toEqual({ ok: true, deliveryId: "ghd_1" });
  });
  it("rejects a tampered body", () => {
    const r = verifyGitHubWebhook(Buffer.from(body + " "), sign(body), secret);
    expect(r.ok).toBe(false);
  });
  it("rejects a wrong secret", () => {
    const r = verifyGitHubWebhook(Buffer.from(body), sign(body, "other"), secret);
    expect(r.ok).toBe(false);
  });
  it("rejects missing headers", () => {
    expect(verifyGitHubWebhook(Buffer.from(body), new Headers(), secret).ok).toBe(false);
  });
});
