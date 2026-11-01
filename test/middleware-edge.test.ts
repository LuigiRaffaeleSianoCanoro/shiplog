import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const MIDDLEWARE = join(ROOT, "middleware.ts");
const EDGE_DIR = join(ROOT, "edge");

const FORBIDDEN = /posthog|axios|@\/lib\/(analytics|store|jobs|changelog|backfill|cronPoll|env)/;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTsFiles(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("middleware edge safety", () => {
  it("middleware.ts does not import server-only lib paths", () => {
    const src = readFileSync(MIDDLEWARE, "utf8");
    expect(src).not.toMatch(FORBIDDEN);
    expect(src).not.toMatch(/from\s+["']@\/lib\//);
  });

  it("edge/ modules stay free of forbidden imports", () => {
    for (const file of listTsFiles(EDGE_DIR)) {
      const rel = file.slice(ROOT.length + 1);
      const src = readFileSync(file, "utf8");
      expect(src, rel).not.toMatch(FORBIDDEN);
      expect(src, rel).not.toMatch(/^import\s/m);
    }
  });
});
