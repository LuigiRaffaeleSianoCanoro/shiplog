import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = join(import.meta.dirname, "..", "app/(changelog)/[namespace]/[repo]/page.tsx");

describe("public changelog page ISR", () => {
  it("does not call next/headers during render (keeps revalidate effective)", () => {
    const src = readFileSync(PAGE, "utf8");
    expect(src).toContain("export const revalidate = 300");
    expect(src).not.toMatch(/from\s+["']next\/headers["']/);
    expect(src).not.toMatch(/requestOrigin/);
    expect(src).toMatch(/publicSiteOrigin/);
    expect(src).toMatch(/schedulePublicChangelogViewed/);
  });
});