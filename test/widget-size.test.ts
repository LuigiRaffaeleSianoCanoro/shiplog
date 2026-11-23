import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../public/widget.js", import.meta.url), "utf8");

describe("public/widget.js", () => {
  it("stays under 5 KB gzipped so one script tag is cheap to embed", () => {
    expect(gzipSync(src).length).toBeLessThan(5 * 1024);
  });

  it("is pure ASCII so host pages without a charset still show accents", () => {
    expect(/[^\x00-\x7f]/.test(src)).toBe(false);
  });

  it("never writes feed data through innerHTML", () => {
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  });
});
