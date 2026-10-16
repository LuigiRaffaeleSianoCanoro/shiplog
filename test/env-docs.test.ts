import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const SCAN_DIRS = ["lib", "app"] as const;
const SELF_HOST = join(ROOT, "docs/self-host.md");
const ENV_EXAMPLE = join(ROOT, ".env.example");

/** Platform vars are read in code but set by Vercel or Next.js, not copied from .env.example. */
const PLATFORM_VARS = new Set(["NODE_ENV", "VERCEL"]);

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTsFiles(p));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function envVarsInCode(): Set<string> {
  const re = /process\.env\.([A-Z][A-Z0-9_]*)/g;
  const vars = new Set<string>();
  for (const dir of SCAN_DIRS) {
    for (const file of listTsFiles(join(ROOT, dir))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(re)) vars.add(m[1]);
    }
  }
  return vars;
}

function documentedInEnvExample(name: string, text: string): boolean {
  if (PLATFORM_VARS.has(name)) return true;
  return new RegExp(`^${name}\\s*=`, "m").test(text) || new RegExp(`^#\\s*${name}\\b`, "m").test(text);
}

describe("environment variable documentation", () => {
  const codeVars = envVarsInCode();
  const envExample = readFileSync(ENV_EXAMPLE, "utf8");
  const selfHost = readFileSync(SELF_HOST, "utf8");

  it("discovers every env var used under lib/ and app/", () => {
    expect(codeVars.size).toBeGreaterThan(10);
  });

  for (const name of [...codeVars].sort()) {
    it(`${name} is documented in .env.example`, () => {
      expect(documentedInEnvExample(name, envExample)).toBe(true);
    });
    it(`${name} is mentioned in docs/self-host.md`, () => {
      expect(selfHost.includes(name)).toBe(true);
    });
  }
});
