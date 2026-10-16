import { beforeEach, describe, expect, it, vi } from "vitest";

async function setup() {
  vi.resetModules();
  delete process.env.ORIGIN_APP_ID;
  delete process.env.ORIGIN_APP_PRIVATE_KEY;
  const { MemoryStore } = await import("@/lib/store/memory");
  const storeMod = await import("@/lib/store");
  const store = new MemoryStore();
  storeMod.setStore(store);
  const jobs = await import("@/lib/jobs");
  return { store, jobs };
}

describe("provider=origin vs provider=github", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("keeps independent uninstall for dual installs on the same namespace", async () => {
    const { store, jobs } = await setup();
    await store.upsertInstallation({ id: "i_origin", namespace: "acme", provider: "origin", status: "active", createdAt: "" });
    await store.upsertInstallation({ id: "4242", namespace: "acme", provider: "github", status: "active", createdAt: "" });
    await store.putKey({ ciphertext: "x", iv: "x", tag: "x", keyVersion: 1, installationId: "4242", last4: "abcd", createdAt: "" });

    await jobs.handleEvent({ installationId: "4242", event: { type: "installation.deleted", payload: {} } }, "gh-del");

    expect((await store.getInstallation("4242"))?.status).toBe("disconnected");
    expect((await store.getInstallation("4242"))?.provider).toBe("github");
    expect(await store.getKey("4242")).toBeNull();
    expect((await store.getInstallation("i_origin"))?.status).toBe("active");
    expect((await store.getInstallation("i_origin"))?.provider).toBe("origin");
  });
});
