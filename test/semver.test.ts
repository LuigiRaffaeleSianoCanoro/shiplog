import { describe, expect, it } from "vitest";
import { addEntry, bumpNote, EMPTY, isBreaking, latestVersion, nextVersion, suggestBump, unreleased } from "@/lib/changelog";

describe("breaking changes and version suggestion", () => {
  it("detects ! and BREAKING CHANGE", () => {
    expect(isBreaking("feat!: drop node 18", "")).toBe(true);
    expect(isBreaking("feat(api)!: rename", "")).toBe(true);
    expect(isBreaking("feat: x", "Some text\n\nBREAKING CHANGE: config moved")).toBe(true);
    expect(isBreaking("feat: x", "BREAKING-CHANGE: y")).toBe(true);
    expect(isBreaking("fix: not breaking!", "mentions breaking change casually")).toBe(false);
  });

  it("suggests major, minor or patch from Unreleased", () => {
    expect(suggestBump(unreleased(addEntry(null, "Fixed", "Bug (#1)")))).toBe("patch");
    expect(suggestBump(unreleased(addEntry(addEntry(null, "Fixed", "Bug (#1)"), "Added", "New (#2)")))).toBe("minor");
    expect(suggestBump(unreleased(addEntry(null, "Changed", "**BREAKING:** Config moved (#3)")))).toBe("major");
    expect(suggestBump(unreleased(addEntry(null, "Removed", "Old API (#4)")))).toBe("major");
    expect(suggestBump("")).toBeNull();
  });

  it("computes the next version from the last release", () => {
    const md = EMPTY + "\n## [1.4.2] - 2026-01-01\n\n### Fixed\n\n- x\n";
    expect(latestVersion(md)).toBe("1.4.2");
    expect(latestVersion(EMPTY)).toBeNull();
    expect(nextVersion("1.4.2", "major")).toBe("2.0.0");
    expect(nextVersion("1.4.2", "minor")).toBe("1.5.0");
    expect(nextVersion("1.4.2", "patch")).toBe("1.4.3");
  });

  it("writes a note and flags a mismatch with the requested version", () => {
    const md = addEntry(EMPTY + "\n## [1.4.2] - 2026-01-01\n", "Added", "**BREAKING:** New auth (#5)");
    const note = bumpNote(md, "v1.5.0")!;
    expect(note).toContain("major"); expect(note).toContain("2.0.0"); expect(note).toContain("v1.5.0");
    expect(bumpNote(md, "v2.0.0")).not.toContain("asked");
    expect(bumpNote(EMPTY, "v1.0.0")).toBeNull();
    expect(note).not.toContain("|");
  });
});
