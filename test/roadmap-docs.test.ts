import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(__dirname, "..");
const docs = ["ROADMAP.md", "PROGRESS.md", "docs/BACKLOG.md"];

describe("roadmap docs", () => {
  it.each(docs)("%s links only to files that exist", (doc) => {
    const md = readFileSync(join(root, doc), "utf8");
    const local = [...md.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)].map((m) => m[1]).filter((h) => !/^[a-z]+:/i.test(h));
    const missing = local.filter((h) => !existsSync(join(root, dirname(doc), h)));
    expect(missing).toEqual([]);
  });

  it("ROADMAP targets main, not the retired feat/mvp line", () => {
    const md = readFileSync(join(root, "ROADMAP.md"), "utf8");
    expect(md).not.toContain("feat/mvp");
    expect(md).toContain("against `main`");
  });

  it("every Done roadmap item that cites a PR number also appears in the backlog or progress log", () => {
    const roadmap = readFileSync(join(root, "ROADMAP.md"), "utf8");
    const rest = docs.slice(1).map((d) => readFileSync(join(root, d), "utf8")).join("\n");
    const cited = [...new Set([...roadmap.matchAll(/#(\d{2,3})\b/g)].map((m) => m[1]))].filter((n) => Number(n) >= 41);
    expect(cited.filter((n) => !rest.includes(`#${n}`))).toEqual([]);
  });
});
