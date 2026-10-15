import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, excludedBy, parseConfig, sectionFor } from "@/lib/config";

describe(".shiplog.yml", () => {
  it("defaults when missing or invalid", () => {
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig(": : not yaml [").changelogPath).toBe("CHANGELOG.md");
  });

  it("reads every option and ignores bad values", () => {
    const c = parseConfig(`
sections:
  feat: Added
  deps: Security
  junk: Nope
exclude:
  labels: [skip-changelog, wip]
  authors: [dependabot, "*[bot]", bots]
language: es
tone: playful
changelog: docs/CHANGES.md
mode: prompt
`);
    expect(c.sections.deps).toBe("Security");
    expect(c.sections.junk).toBeUndefined();
    expect(c.exclude.labels).toEqual(["skip-changelog", "wip"]);
    expect(c.language).toBe("es"); expect(c.tone).toBe("playful");
    expect(c.changelogPath).toBe("docs/CHANGES.md"); expect(c.mode).toBe("prompt");
    expect(parseConfig("mode: weird\nchangelog: ../etc/passwd").mode).toBe("agent");
    expect(parseConfig("changelog: ../etc/passwd").changelogPath).toBe("CHANGELOG.md");
  });

  it("maps custom prefixes on top of the defaults", () => {
    const c = parseConfig("sections:\n  deps: Security\n  chore: Removed");
    expect(sectionFor("deps(npm): bump x", c)).toBe("Security");
    expect(sectionFor("chore: drop y", c)).toBe("Removed");
    expect(sectionFor("fix: z", c)).toBe("Fixed");
    expect(sectionFor("no prefix", c)).toBeNull();
  });

  it("excludes by label, author name, wildcard and bots", () => {
    const c = parseConfig('exclude:\n  labels: [skip-changelog]\n  authors: [dependabot, "renovate*", bots]');
    expect(excludedBy({ labels: [{ name: "Skip-Changelog" }] }, c)).toBe("label skip-changelog");
    expect(excludedBy({ labels: ["other"] }, c)).toBeNull();
    expect(excludedBy({ author: { user: { slug: "dependabot" } } }, c)).toBe("author dependabot");
    expect(excludedBy({ author: { user: { slug: "renovate-bot" } } }, c)).toBe("author renovate-bot");
    expect(excludedBy({ author: { app: { slug: "ci-helper" } } }, c)).toBe("author ci-helper");
    expect(excludedBy({ author: { user: { slug: "luigi" } } }, c)).toBeNull();
    expect(excludedBy({ labels: [{ name: "skip-changelog" }] }, DEFAULT_CONFIG)).toBe("label skip-changelog");
  });
});
