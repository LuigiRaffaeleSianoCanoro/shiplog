import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { addEntry, cutRelease } from "@/lib/changelog";
import { setStore } from "@/lib/store";
import { MemoryStore } from "@/lib/store/memory";
import { GET as getChangelog } from "@/app/api/v1/changelogs/[namespace]/[repo]/route";
import { GET as getPackages } from "@/app/api/v1/changelogs/[namespace]/[repo]/packages/route";
import { GET as getRelease } from "@/app/api/v1/changelogs/[namespace]/[repo]/releases/[version]/route";

type Schema = { $ref?: string; type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; additionalProperties?: Schema | boolean };
const spec = parse(readFileSync(new URL("../docs/openapi/v1-changelogs.yaml", import.meta.url), "utf8"));

function resolve(s: Schema): Schema {
  if (!s.$ref) return s;
  const name = s.$ref.replace("#/components/schemas/", "");
  return spec.components.schemas[name];
}

/** Collects every mismatch between a real JSON value and the documented schema. */
function check(value: unknown, schema: Schema, path: string, out: string[]) {
  const s = resolve(schema);
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
    if (!types.includes("object")) out.push(`${path}: unexpected object`);
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
  if (!t.some((x) => types.includes(x))) out.push(`${path}: ${typeof value} not in ${types.join("|")}`);
}

function responseSchema(path: string, status: string): Schema {
  let response = spec.paths[path].get.responses[status];
  if (response.$ref) response = spec.components.responses[response.$ref.replace("#/components/responses/", "")];
  return response.content["application/json"].schema;
}

const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
const req = (url: string) => new Request(`https://shiplog.test${url}`);

beforeEach(async () => {
  const file = `/tmp/shiplog-openapi-${Math.random()}.json`;
  vi.stubEnv("SHIPLOG_DATA_FILE", file);
  const store = new MemoryStore(file);
  await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" } as never);
  let md = addEntry(null, "Added", "Widget (#1)");
  md = cutRelease(md, "1.0.0", "2026-11-01");
  md = addEntry(md, "Fixed", "Escape closes panel (#2)");
  await store.putChangelog("acme/demo", md);
  await store.putChangelog("acme/demo::packages/web/CHANGELOG.md", addEntry(null, "Added", "Web (#3)"));
  setStore(store);
});
afterEach(() => vi.unstubAllEnvs());

describe("docs/openapi/v1-changelogs.yaml matches the real v1 routes", () => {
  it("documents exactly the route files under app/api/v1", () => {
    const files: Record<string, string> = {
      "/api/v1/changelogs/{namespace}/{repo}": "app/api/v1/changelogs/[namespace]/[repo]/route.ts",
      "/api/v1/changelogs/{namespace}/{repo}/packages": "app/api/v1/changelogs/[namespace]/[repo]/packages/route.ts",
      "/api/v1/changelogs/{namespace}/{repo}/releases/{version}": "app/api/v1/changelogs/[namespace]/[repo]/releases/[version]/route.ts",
    };
    expect(Object.keys(spec.paths).sort()).toEqual(Object.keys(files).sort());
    for (const f of Object.values(files)) expect(existsSync(new URL(`../${f}`, import.meta.url))).toBe(true);
  });

  it.each([
    ["changelog", "/api/v1/changelogs/{namespace}/{repo}", () => getChangelog(req("/api/v1/changelogs/acme/demo"), ctx({ namespace: "acme", repo: "demo" }))],
    ["package changelog", "/api/v1/changelogs/{namespace}/{repo}", () => getChangelog(req("/api/v1/changelogs/acme/demo?changelog=packages/web/CHANGELOG.md"), ctx({ namespace: "acme", repo: "demo" }))],
    ["packages", "/api/v1/changelogs/{namespace}/{repo}/packages", () => getPackages(req("/api/v1/changelogs/acme/demo/packages"), ctx({ namespace: "acme", repo: "demo" }))],
    ["release", "/api/v1/changelogs/{namespace}/{repo}/releases/{version}", () => getRelease(req("/api/v1/changelogs/acme/demo/releases/v1.0.0"), ctx({ namespace: "acme", repo: "demo", version: "v1.0.0" }))],
  ])("%s 200 body matches the schema", async (_n, path, call) => {
    const res = await call();
    expect(res.status).toBe(200);
    const errors: string[] = [];
    check(await res.json(), responseSchema(path, "200"), "$", errors);
    expect(errors).toEqual([]);
  });

  it.each([
    ["unknown repo", "/api/v1/changelogs/{namespace}/{repo}", () => getChangelog(req("/api/v1/changelogs/nobody/demo"), ctx({ namespace: "nobody", repo: "demo" }))],
    ["unknown release", "/api/v1/changelogs/{namespace}/{repo}/releases/{version}", () => getRelease(req("/api/v1/changelogs/acme/demo/releases/9.9.9"), ctx({ namespace: "acme", repo: "demo", version: "9.9.9" }))],
  ])("%s 404 body matches the schema", async (_n, path, call) => {
    const res = await call();
    expect(res.status).toBe(404);
    const errors: string[] = [];
    check(await res.json(), responseSchema(path, "404"), "$", errors);
    expect(errors).toEqual([]);
  });
});
