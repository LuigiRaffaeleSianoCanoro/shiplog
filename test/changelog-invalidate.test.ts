import { describe, expect, it } from "vitest";
import { repoSlugFromStorageKey } from "@/lib/changelog-invalidate";

describe("repoSlugFromStorageKey", () => {
  it("strips monorepo and notes suffixes for cache paths", () => {
    expect(repoSlugFromStorageKey("acme/demo")).toBe("acme/demo");
    expect(repoSlugFromStorageKey("acme/demo::packages/web/CHANGELOG.md")).toBe("acme/demo");
    expect(repoSlugFromStorageKey("acme/demo::notes::1.0.0")).toBe("acme/demo");
  });
});
