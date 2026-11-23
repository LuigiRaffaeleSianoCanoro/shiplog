import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { addEntry, cutRelease } from "@/lib/changelog";
import { setStore, StoreAuthError, type Store } from "@/lib/store";
import { MemoryStore } from "@/lib/store/memory";
import { GET as getChangelog } from "@/app/api/v1/changelogs/[namespace]/[repo]/route";
import { GET as getPackages } from "@/app/api/v1/changelogs/[namespace]/[repo]/packages/route";
import { GET as getRelease } from "@/app/api/v1/changelogs/[namespace]/[repo]/releases/[version]/route";

type Schema = {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: Schema | boolean;
  const?: unknown;
  enum?: unknown[];
  format?: string;
  oneOf?: Schema[];
};
const ROOT = new URL("..", import.meta.url).pathname;
const spec = parse(readFileSync(join(ROOT, "docs/openapi/v1-changelogs.yaml"), "utf8"));
const READ_CACHE = "public, s-maxage=300, stale-while-revalidate=600";

const resolve = (s: Schema): Schema => (s.$ref ? spec.components.schemas[s.$ref.replace("#/components/schemas/", "")] : s);

const FORMATS: Record<string, (v: string) => boolean> = {
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v),
  "date-time": (v) => !Number.isNaN(Date.parse(v)) && v.includes("T"),
  uri: (v) => { try { new URL(v); return true; } catch { return false; } },
};

/** Collects every mismatch between a real JSON value and the documented schema. */
function check(value: unknown, schema: Schema, path: string, out: string[]) {
  const s = resolve(schema);
  if (s.oneOf) {
    const passing = s.oneOf.filter((alt) => { const e: string[] = []; check(value, alt, path, e); return e.length === 0; });
    if (passing.length !== 1) out.push(`${path}: matches ${passing.length} oneOf branches`);
    return;
  }
  if (s.const !== undefined && value !== s.const) out.push(`${path}: expected const ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(value)) out.push(`${path}: not in enum`);
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  if (value === null) {
    if (!types.includes("null")) out.push(`${path}: null not allowed`);
    return;
  }
  if (Array.isArray(value)) {
    if (!types.includes("array")) out.push(`${path}: unexpected array`);
    value.forEach((v, i) => s.items && check(v, s.items, `${path}[${i}]`, out));
    return;
  }
  if (typeof value === "object") {
    if (!types.includes("object") && !s.properties) out.push(`${path}: unexpected object`);
    const obj = value as Record<string, unknown>;
    for (const k of s.required ?? []) if (!(k in obj)) out.push(`${path}.${k}: required but missing`);
    for (const [k, v] of Object.entries(obj)) {
      const prop = s.properties?.[k] ?? (typeof s.additionalProperties === "object" ? s.additionalProperties : undefined);
      if (!prop) out.push(`${path}.${k}: not documented`);
      else check(v, prop, `${path}.${k}`, out);
    }
    return;
  }
  const t = typeof value === "number" ? (Number.isInteger(value) ? ["integer", "number"] : ["number"]) : [typeof value];
  if (types.length && !t.some((x) => types.includes(x))) out.push(`${path}: ${typeof value} not in ${types.join("|")}`);
  if (typeof value === "string" && s.format && FORMATS[s.format] && !FORMATS[s.format](value)) out.push(`${path}: not a ${s.format}`);
}

function responseSchema(path: string, status: string): Schema {
  let response = spec.paths[path].get.responses[status];
  if (response.$ref) response = spec.components.responses[response.$ref.replace("#/components/responses/", "")];
  return response.content["application/json"].schema;
}

async function expectMatches(res: Response, path: string, status: number) {
  expect(res.status).toBe(status);
  const errors: string[] = [];
  check(await res.json(), responseSchema(path, String(status)), "$", errors);
  expect(errors).toEqual([]);
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? routeFiles(p) : n === "route.ts" ? [p] : [];
  });
}

const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
const req = (url: string) => new Request(`https://shiplog.test${url}`);
const acme = { namespace: "acme", repo: "demo" };
const CL = "/api/v1/changelogs/{namespace}/{repo}";
const PKG = "/api/v1/changelogs/{namespace}/{repo}/packages";
const REL = "/api/v1/changelogs/{namespace}/{repo}/releases/{version}";

beforeEach(async () => {
  const file = `/tmp/shiplog-openapi-${Math.random()}.json`;
  vi.stubEnv("SHIPLOG_DATA_FILE", file);
  const store = new MemoryStore(file);
  await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" } as never);
  let md = addEntry(null, "Added", "Widget (#1)");
  md = cutRelease(md, "1.0.0", "2026-11-01", "First release");
  md = addEntry(md, "Fixed", "Escape closes panel (#2)");
  await store.putChangelog("acme/demo", md);
  await store.putChangelog("acme/demo::packages/web/CHANGELOG.md", cutRelease(addEntry(null, "Added", "Web (#3)"), "0.1.0", "2026-11-02"));
  setStore(store);
});
afterEach(() => vi.unstubAllEnvs());

describe("docs/openapi/v1-changelogs.yaml matches the real v1 routes", () => {
  it("documents every route file under app/api/v1 and nothing else", () => {
    const fromFiles = routeFiles(join(ROOT, "app/api/v1"))
      .map((f) => "/" + relative(ROOT, f).replace(/^app\//, "").replace(/\/route\.ts$/, "").replace(/\[(\w+)\]/g, "{$1}"))
      .sort();
    expect(Object.keys(spec.paths).sort()).toEqual(fromFiles);
  });

  it("changelog 200 matches the schema and uses the documented cache header", async () => {
    const res = await getChangelog(req("/api/v1/changelogs/acme/demo"), ctx(acme));
    expect(res.headers.get("cache-control")).toBe(READ_CACHE);
    await expectMatches(res, CL, 200);
  });

  it("package changelog 200 matches the schema", async () => {
    await expectMatches(await getChangelog(req("/api/v1/changelogs/acme/demo?changelog=packages/web/CHANGELOG.md"), ctx(acme)), CL, 200);
  });

  it("packages 200 matches the schema", async () => {
    await expectMatches(await getPackages(req("/api/v1/changelogs/acme/demo/packages"), ctx(acme)), PKG, 200);
  });

  it.each([["v1.0.0"], ["1.0.0"], ["Unreleased"]])("release %s 200 matches the schema", async (version) => {
    await expectMatches(await getRelease(req(`/api/v1/changelogs/acme/demo/releases/${version}`), ctx({ ...acme, version })), REL, 200);
  });

  it("package release via ?changelog matches the schema", async () => {
    const res = await getRelease(req("/api/v1/changelogs/acme/demo/releases/0.1.0?changelog=packages/web/CHANGELOG.md"), ctx({ ...acme, version: "0.1.0" }));
    await expectMatches(res, REL, 200);
  });

  it("unknown repo answers not_found on every route", async () => {
    const nobody = { namespace: "nobody", repo: "demo" };
    for (const [res, path] of [
      [await getChangelog(req("/api/v1/changelogs/nobody/demo"), ctx(nobody)), CL],
      [await getPackages(req("/api/v1/changelogs/nobody/demo/packages"), ctx(nobody)), PKG],
      [await getRelease(req("/api/v1/changelogs/nobody/demo/releases/1.0.0"), ctx({ ...nobody, version: "1.0.0" })), REL],
    ] as const) {
      expect((await res.clone().json()).error).toBe("not_found");
      await expectMatches(res, path, 404);
    }
  });

  it("unknown release answers release_not_found with the version", async () => {
    const res = await getRelease(req("/api/v1/changelogs/acme/demo/releases/9.9.9"), ctx({ ...acme, version: "9.9.9" }));
    expect(await res.clone().json()).toEqual({ error: "release_not_found", version: "9.9.9" });
    await expectMatches(res, REL, 404);
  });

  it("rate limits answer the documented 429 with Retry-After and no-store on every route", async () => {
    vi.stubEnv("SHIPLOG_RATE_LIMIT_API", "1");
    const r = () => new Request("https://shiplog.test/api/v1/changelogs/acme/demo", { headers: { "x-real-ip": `203.0.113.99` } });
    await getChangelog(r(), ctx(acme)); // spend the minute's budget
    for (const [res, path] of [
      [await getChangelog(r(), ctx(acme)), CL],
      [await getPackages(r(), ctx(acme)), PKG],
      [await getRelease(r(), ctx({ ...acme, version: "1.0.0" })), REL],
    ] as const) {
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      await expectMatches(res, path, 429);
    }
  });

  it("store outage answers the documented 503 with no-store on every route", async () => {
    const err = new StoreAuthError("shiplog/v1/");
    setStore(new Proxy({} as Store, { get: (_t, p) => (p === "then" ? undefined : () => Promise.reject(err)) }));
    for (const [res, path] of [
      [await getChangelog(req("/api/v1/changelogs/acme/demo"), ctx(acme)), CL],
      [await getPackages(req("/api/v1/changelogs/acme/demo/packages"), ctx(acme)), PKG],
      [await getRelease(req("/api/v1/changelogs/acme/demo/releases/1.0.0"), ctx({ ...acme, version: "1.0.0" })), REL],
    ] as const) {
      expect(res.headers.get("cache-control")).toBe("no-store");
      await expectMatches(res, path, 503);
    }
  });
});
