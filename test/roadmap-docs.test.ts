import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const docs = ["ROADMAP.md", "PROGRESS.md", "docs/BACKLOG.md"];
// GitHub heading anchors: lowercase, drop punctuation except - and _, spaces to -.
const anchors = (md: string) => new Set([...md.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1].trim().toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-")));
const backlogRows = () => [...read("docs/BACKLOG.md").matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));

describe("roadmap docs", () => {
  it.each(docs)("%s links only to files and headings that exist", (doc) => {
    const links = [...read(doc).matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((h) => !/^[a-z]+:/i.test(h));
    expect(links.length).toBeGreaterThan(0);
    const broken = links.filter((h) => {
      const [file, frag] = h.split("#");
      const target = file ? join(dirname(doc), file) : doc;
      if (!existsSync(join(root, target))) return true;
      return Boolean(frag) && target.endsWith(".md") && !anchors(read(target)).has(frag);
    });
    expect(broken).toEqual([]);
  });

  it("no doc tells contributors to target feat/mvp, and ROADMAP never mentions it", () => {
    for (const d of docs) expect(read(d)).not.toMatch(/(against|open (a )?(small )?PR(s)? (against|to)) `feat\/mvp`/i);
    expect(read("ROADMAP.md")).not.toContain("feat/mvp");
  });

  it("backlog rows are unique and every 'backlog N' citation resolves", () => {
    const rows = backlogRows();
    expect(new Set(rows).size).toBe(rows.length);
    const cited = docs.flatMap((d) => [...read(d).matchAll(/backlog (\d+)/gi)].map((m) => Number(m[1])));
    expect(cited.filter((n) => !rows.includes(n))).toEqual([]);
  });

  it("PRs that ROADMAP cites as Done are recorded in the backlog or progress log", () => {
    const done = read("ROADMAP.md").split("## Next")[0];
    const rest = read("PROGRESS.md") + read("docs/BACKLOG.md");
    const cited = [...new Set([...done.matchAll(/#(\d+)\b/g)].map((m) => m[1]))].filter((n) => Number(n) >= 41);
    expect(cited.length).toBeGreaterThan(5);
    expect(cited.filter((n) => !new RegExp(`#${n}\\b`).test(rest))).toEqual([]);
  });
});
