import { describe, expect, it } from "vitest";
import { parseConfig } from "@/lib/config";
import { allChangelogPaths, changelogTargets, pathMatchesGlob } from "@/lib/packages";

const mono = parseConfig(`
changelog: CHANGELOG.md
packages:
  web:
    paths: [packages/web/**, apps/web/**]
    changelog: packages/web/CHANGELOG.md
  api:
    paths: [packages/api/**]
    changelog: packages/api/CHANGELOG.md
orphan: root
`);

describe("path globs", () => {
  it("matches paths with * and **", () => {
    expect(pathMatchesGlob("packages/web/**", "packages/web/src/index.ts")).toBe(true);
    expect(pathMatchesGlob("packages/web/**", "packages/api/x")).toBe(false);
    expect(pathMatchesGlob("apps/web/*", "apps/web/main.ts")).toBe(true);
    expect(pathMatchesGlob("apps/web/*", "apps/web/nested/x")).toBe(false);
  });
});

describe("changelog routing", () => {
  it("single-changelog repos use the root path only", () => {
    const c = parseConfig("changelog: docs/HISTORY.md");
    expect(changelogTargets(["any/file.ts"], c)).toEqual(["docs/HISTORY.md"]);
  });

  it("routes each touched package and dedupes", () => {
    expect(changelogTargets(["packages/web/a.ts", "packages/api/b.ts"], mono).sort()).toEqual(
      ["packages/api/CHANGELOG.md", "packages/web/CHANGELOG.md"],
    );
    expect(changelogTargets(["packages/web/a.ts", "packages/web/b.ts"], mono)).toEqual(["packages/web/CHANGELOG.md"]);
  });

  it("orphan files go to root or are dropped", () => {
    expect(changelogTargets(["README.md"], mono)).toEqual(["CHANGELOG.md"]);
    const ignore = parseConfig(`packages:\n  web:\n    paths: [packages/web/**]\n    changelog: packages/web/CHANGELOG.md\norphan: ignore`);
    expect(changelogTargets(["README.md"], ignore)).toEqual([]);
    expect(changelogTargets(["packages/web/x.ts", "README.md"], ignore).sort()).toEqual(["packages/web/CHANGELOG.md"]);
  });

  it("lists every managed changelog for releases", () => {
    expect(allChangelogPaths(mono).sort()).toEqual(["CHANGELOG.md", "packages/api/CHANGELOG.md", "packages/web/CHANGELOG.md"]);
    expect(allChangelogPaths(parseConfig("changelog: ROOT.md"))).toEqual(["ROOT.md"]);
  });
});

describe("packages config parsing", () => {
  it("ignores bad package entries", () => {
    const c = parseConfig(`
packages:
  ok:
    paths: [src/**]
    changelog: pkg/CHANGELOG.md
  bad-path:
    paths: []
    changelog: x/CHANGELOG.md
  no-changelog:
    paths: [a/**]
`);
    expect(c.packages).toHaveLength(1);
    expect(c.packages[0].name).toBe("ok");
    expect(parseConfig("packages:\n  x:\n    paths: [../secret]\n    changelog: CHANGELOG.md").packages).toHaveLength(0);
  });
});
