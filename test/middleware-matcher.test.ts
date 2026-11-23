import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const matcherLine = readFileSync(join(import.meta.dirname, "..", "middleware.ts"), "utf8").match(
  /matcher:\s*\[\s*"(.+)"\s*,?\s*\]/,
)?.[1];
if (!matcherLine) throw new Error("middleware matcher not found");

const pattern = new RegExp(`^${matcherLine}$`);

function matches(path: string): boolean {
  return pattern.test(path);
}

describe("middleware matcher scope", () => {
  it("matches changelog slug paths", () => {
    expect(matches("/acme/demo")).toBe(true);
    expect(matches("/acme/demo/feed.xml")).toBe(true);
  });

  it("skips marketing, app, and API routes", () => {
    expect(matches("/")).toBe(false);
    expect(matches("/privacy")).toBe(false);
    expect(matches("/dashboard")).toBe(false);
    expect(matches("/setup")).toBe(false);
    expect(matches("/api/health")).toBe(false);
    expect(matches("/api/v1/changelogs/acme/demo")).toBe(false);
    expect(matches("/ingest/e")).toBe(false);
    expect(matches("/brand/logo.svg")).toBe(false);
  });
});