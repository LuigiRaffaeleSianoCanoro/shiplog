import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseConfig } from "@/lib/config";
import {
  buildHistoricalChangelog,
  changelogNeedsBackfill,
  compareSemverTags,
  type HistoricalPr,
  type HistoricalTag,
} from "@/lib/history";
import { unreleased } from "@/lib/changelog";

const pr = (n: string, title: string, mergedAt: string, extra: Partial<HistoricalPr> = {}): HistoricalPr => ({
  number: n,
  title,
  body: "",
  mergedAt,
  ...extra,
});

describe("changelogNeedsBackfill", () => {
  it("wants backfill when the file is missing or empty", () => {
    expect(changelogNeedsBackfill(null)).toBe(true);
    expect(changelogNeedsBackfill("")).toBe(true);
    expect(changelogNeedsBackfill("# Changelog\n\n## [Unreleased]\n")).toBe(true);
  });
  it("skips when releases or unreleased bullets already exist", () => {
    expect(changelogNeedsBackfill("# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Ship (#1)\n")).toBe(false);
    expect(changelogNeedsBackfill("# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n")).toBe(false);
  });
  it("does not overwrite unfamiliar changelog shapes", () => {
    expect(changelogNeedsBackfill("# Release notes\n\nWe shipped a lot.\n")).toBe(false);
  });
});

describe("buildHistoricalChangelog", () => {
  it("groups merged PRs into Keep a Changelog sections", () => {
    const md = buildHistoricalChangelog(
      [pr("2", "fix: save bug", "2026-02-02T12:00:00Z"), pr("1", "feat: dark mode", "2026-02-01T12:00:00Z")],
      [],
      DEFAULT_CONFIG,
    );
    const u = unreleased(md);
    expect(u).toContain("### Added");
    expect(u).toContain("dark mode (#1)");
    expect(u).toContain("### Fixed");
    expect(u).toContain("save bug (#2)");
  });

  it("cuts releases at semver tags by merge time", () => {
    const tags: HistoricalTag[] = [{ name: "v1.0.0", at: "2026-02-01T18:00:00Z" }];
    const md = buildHistoricalChangelog(
      [
        pr("1", "feat: alpha", "2026-01-31T12:00:00Z"),
        pr("2", "fix: beta", "2026-02-02T12:00:00Z"),
      ],
      tags,
      DEFAULT_CONFIG,
    );
    expect(md).toContain("## [1.0.0] - 2026-02-01");
    expect(md).toMatch(/## \[1\.0\.0\][\s\S]*alpha \(#1\)/);
    expect(unreleased(md)).toContain("beta (#2)");
    expect(unreleased(md)).not.toContain("alpha");
  });

  it("honors exclude labels from config", () => {
    const cfg = parseConfig("exclude:\n  labels: [wip]\n");
    const md = buildHistoricalChangelog([pr("3", "feat: x", "2026-03-01T00:00:00Z", { labels: [{ name: "wip" }] })], [], cfg);
    expect(unreleased(md)).toBe("");
  });

  it("dedupes bullets when the same PR is listed twice", () => {
    const row = pr("4", "feat: once", "2026-03-02T00:00:00Z");
    const md = buildHistoricalChangelog([row, row], [], DEFAULT_CONFIG);
    expect(unreleased(md).match(/once/g)?.length).toBe(1);
  });
});

describe("compareSemverTags", () => {
  it("orders semver tags", () => {
    expect(compareSemverTags("v1.0.0", "v1.1.0")).toBeLessThan(0);
    expect(compareSemverTags("2.0.0", "1.9.9")).toBeGreaterThan(0);
  });
});
