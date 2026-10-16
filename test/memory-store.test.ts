import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store/memory";

describe("MemoryStore file txs", () => {
  it("reloads from disk so another process can publish updates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shiplog-mem-"));
    const file = join(dir, "data.json");
    const writer = new MemoryStore(file);
    const reader = new MemoryStore(file);
    await writer.putChangelog("acme/widget", "## [Unreleased]\n\n- hello");
    expect(await reader.getChangelog("acme/widget")).toContain("hello");
  });

  it("serializes concurrent writes without losing updates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shiplog-mem-"));
    const file = join(dir, "data.json");
    const store = new MemoryStore(file);
    await Promise.all([
      store.claimDelivery("d1"),
      store.claimDelivery("d2"),
      store.claimDelivery("d3"),
    ]);
    const onDisk = JSON.parse(readFileSync(file, "utf8")) as { deliveries: string[] };
    expect(onDisk.deliveries.sort()).toEqual(["d1", "d2", "d3"]);
  });
});
