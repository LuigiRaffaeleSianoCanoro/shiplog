import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";

describe("getActiveInstallationByNamespace", () => {
  it("returns newest active installation for a namespace", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
    await store.upsertInstallation({ id: "i2", namespace: "acme", status: "active", createdAt: "2026-01-02" });
    const hit = await store.getActiveInstallationByNamespace("acme");
    expect(hit?.id).toBe("i2");
  });

  it("ignores disconnected installs", async () => {
    const store = new MemoryStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "disconnected", createdAt: "2026-01-02" });
    await store.upsertInstallation({ id: "i2", namespace: "acme", status: "active", createdAt: "2026-01-01" });
    expect((await store.getActiveInstallationByNamespace("acme"))?.id).toBe("i2");
    expect(await store.getActiveInstallationByNamespace("missing")).toBeNull();
  });
});
