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

describe("no-changelog and Origin author fields", () => {
  it("always honors no-changelog, even when labels are overridden", () => {
    const c = parseConfig("exclude:\n  labels: [wip]");
    expect(excludedBy({ labels: [{ name: "no-changelog" }] }, c)).toBe("label no-changelog");
  });
  it("matches Origin user handles and app display names", () => {
    const c = parseConfig("exclude:\n  authors: [jane, Acme CI]");
    expect(excludedBy({ author: { user: { id: "u1", handle: "jane" } } }, c)).toBe("author jane");
    expect(excludedBy({ author: { app: { id: "a1", displayName: "Acme CI" } } }, c)).toBe("author Acme CI");
  });
});

describe("history option", () => {
  it("defaults on with sensible caps", () => {
    expect(DEFAULT_CONFIG.history.enabled).toBe(true);
    expect(DEFAULT_CONFIG.history.maxPrs).toBe(100);
    expect(parseConfig("history:\n  enabled: false\n  max_prs: 25").history).toEqual({ enabled: false, maxPrs: 25, maxTags: 50 });
  });
});

describe("batch option", () => {
  it("accepts release and daily, defaults to off", () => {
    expect(parseConfig("batch: release").batch).toBe("release");
    expect(parseConfig("batch: daily").batch).toBe("daily");
    expect(parseConfig("batch: hourly").batch).toBe("off");
    expect(DEFAULT_CONFIG.batch).toBe("off");
  });
});

describe("monorepo packages", () => {
  it("defaults to empty packages and orphan root", () => {
    expect(DEFAULT_CONFIG.packages).toEqual([]);
    expect(DEFAULT_CONFIG.orphan).toBe("root");
  });

  it("parses packages and orphan ignore", () => {
    const c = parseConfig(`
packages:
  web:
    paths: [packages/web/**]
    changelog: packages/web/CHANGELOG.md
orphan: ignore
`);
    expect(c.packages[0]).toMatchObject({ name: "web", changelogPath: "packages/web/CHANGELOG.md" });
    expect(c.orphan).toBe("ignore");
  });
});

describe("notify.webhooks", () => {
  it("reads webhook URLs from config", () => {
    const c = parseConfig("notify:\n  webhooks:\n    - https://hooks.slack.com/services/A/B/C\n    - https://example.com/h\n");
    expect(c.notify.webhooks).toEqual(["https://hooks.slack.com/services/A/B/C", "https://example.com/h"]);
    expect(parseConfig(null).notify.webhooks).toEqual([]);
  });
});
