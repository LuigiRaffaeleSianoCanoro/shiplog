import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const secret = "route-test-secret";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => {
      void Promise.resolve(fn());
    },
  };
});

function signed(body: object, event = "installation") {
  const raw = JSON.stringify(body);
  const hex = createHmac("sha256", secret).update(raw).digest("hex");
  return new Request("https://x.test/api/webhooks/github", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-github-delivery": "del-1",
      "x-hub-signature-256": `sha256=${hex}`,
    },
  });
}

describe("POST /api/webhooks/github", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.GITHUB_WEBHOOK_SECRET = secret;
    delete process.env.SHIPLOG_INSECURE_WEBHOOKS;
    const { MemoryStore } = await import("@/lib/store/memory");
    const storeMod = await import("@/lib/store");
    storeMod.setStore(new MemoryStore());
  });

  it("rejects bad signatures", async () => {
    const { POST } = await import("@/app/api/webhooks/github/route");
    const r = await POST(
      new Request("https://x.test/api/webhooks/github", {
        method: "POST",
        body: "{}",
        headers: { "x-github-event": "ping", "x-github-delivery": "d1", "x-hub-signature-256": "sha256=deadbeef" },
      }),
    );
    expect(r.status).toBe(401);
  });

  it("persists provider=github on installation events", async () => {
    const { POST } = await import("@/app/api/webhooks/github/route");
    const { getStore } = await import("@/lib/store");
    const r = await POST(
      signed({
        action: "created",
        installation: { id: 1001, account: { login: "acme" } },
      }),
    );
    expect(r.status).toBe(202);
    await vi.waitFor(async () => {
      expect((await getStore().getInstallation("1001"))?.provider).toBe("github");
    });
    const inst = await getStore().getInstallation("1001");
    expect(inst?.namespace).toBe("acme");
    expect(inst?.status).toBe("active");
  });
});
