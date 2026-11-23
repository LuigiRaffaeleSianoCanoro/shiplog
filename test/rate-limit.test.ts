import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addEntry } from "@/lib/changelog";
import { clientIp, createRateLimiter, limitKey } from "@/lib/rate-limit";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ host: "shiplog.example" })) }));

describe("createRateLimiter", () => {
  it("allows `limit` hits per window per key, then refuses with the seconds left", () => {
    let t = 1_000_000;
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => t });
    expect([rl.hit("a"), rl.hit("a"), rl.hit("a")].map((r) => r.ok)).toEqual([true, true, true]);
    const no = rl.hit("a");
    expect(no).toEqual({ ok: false, retryAfterSec: 60 });
    t += 45_000;
    expect(rl.hit("a")).toEqual({ ok: false, retryAfterSec: 15 });
    expect(rl.hit("b").ok).toBe(true);
    t += 15_000;
    expect(rl.hit("a").ok).toBe(true);
  });

  it("keeps memory bounded by dropping the oldest keys", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2, now: () => 0 });
    rl.hit("a"); rl.hit("b"); rl.hit("c");
    expect(rl.size()).toBe(2);
    expect(rl.hit("a").ok).toBe(true); // "a" was evicted, so it starts fresh
  });
});

describe("clientIp", () => {
  const h = (o: Record<string, string>) => new Request("https://x.test", { headers: o });
  it("prefers x-real-ip, then the first x-forwarded-for entry", () => {
    expect(clientIp(h({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.9");
    expect(clientIp(h({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(h({}))).toBe("unknown");
  });
});

const ctx = { params: Promise.resolve({ namespace: "acme", repo: "demo" }) };
const fromIp = (path: string, ip: string, init: RequestInit = {}) =>
  new Request(`https://shiplog.test${path}`, { ...init, headers: { "x-real-ip": ip, ...(init.headers as Record<string, string> | undefined) } });

async function seeded() {
  vi.resetModules();
  const file = `/tmp/shiplog-rl-${Math.random()}.json`;
  vi.stubEnv("SHIPLOG_DATA_FILE", file);
  const { MemoryStore } = await import("@/lib/store/memory");
  const store = new MemoryStore(file);
  await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" } as never);
  await store.putChangelog("acme/demo", addEntry(null, "Added", "Widget (#1)"));
  (await import("@/lib/store")).setStore(store);
}

beforeEach(seeded);
afterEach(() => vi.unstubAllEnvs());

describe("read API rate limit", () => {
  it("answers 429 rate_limited with Retry-After and no-store once an IP spends its budget; other IPs are unaffected", async () => {
    vi.stubEnv("SHIPLOG_RATE_LIMIT_API", "2");
    const { GET } = await import("@/app/api/v1/changelogs/[namespace]/[repo]/route");
    expect((await GET(fromIp("/api/v1/changelogs/acme/demo", "203.0.113.1"), ctx)).status).toBe(200);
    expect((await GET(fromIp("/api/v1/changelogs/acme/demo", "203.0.113.1"), ctx)).status).toBe(200);
    const res = await GET(fromIp("/api/v1/changelogs/acme/demo", "203.0.113.1"), ctx);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await GET(fromIp("/api/v1/changelogs/acme/demo", "203.0.113.2"), ctx)).status).toBe(200);
  });

  it("shares one budget across the three v1 routes", async () => {
    vi.stubEnv("SHIPLOG_RATE_LIMIT_API", "2");
    const cl = await import("@/app/api/v1/changelogs/[namespace]/[repo]/route");
    const pk = await import("@/app/api/v1/changelogs/[namespace]/[repo]/packages/route");
    const rel = await import("@/app/api/v1/changelogs/[namespace]/[repo]/releases/[version]/route");
    await cl.GET(fromIp("/api/v1/changelogs/acme/demo", "203.0.113.3"), ctx);
    await pk.GET(fromIp("/api/v1/changelogs/acme/demo/packages", "203.0.113.3"), ctx);
    const res = await rel.GET(fromIp("/api/v1/changelogs/acme/demo/releases/Unreleased", "203.0.113.3"), { params: Promise.resolve({ namespace: "acme", repo: "demo", version: "Unreleased" }) });
    expect(res.status).toBe(429);
  });

  it("SHIPLOG_RATE_LIMIT_API=0 turns it off", async () => {
    vi.stubEnv("SHIPLOG_RATE_LIMIT_API", "0");
    const { GET } = await import("@/app/api/v1/changelogs/[namespace]/[repo]/route");
    const codes = [];
    for (let i = 0; i < 200; i++) codes.push((await GET(fromIp("/api/v1/changelogs/acme/demo", "203.0.113.4"), ctx)).status);
    expect(new Set(codes)).toEqual(new Set([200]));
  });

  it("defaults to 120 requests per minute when unset or invalid", async () => {
    vi.stubEnv("SHIPLOG_RATE_LIMIT_API", "lots");
    const { GET } = await import("@/app/api/v1/changelogs/[namespace]/[repo]/route");
    const codes: number[] = [];
    for (let i = 0; i < 121; i++) codes.push((await GET(fromIp("/api/v1/changelogs/acme/demo", "203.0.113.5"), ctx)).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(120);
    expect(codes[120]).toBe(429);
  });
});

const MCP_INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } };
const mcpPost = (ip: string, headers: Record<string, string> = {}) =>
  fromIp("/api/mcp", ip, { method: "POST", headers: { accept: "application/json, text/event-stream", "content-type": "application/json", ...headers }, body: JSON.stringify(MCP_INIT) });

describe("MCP rate limit and origin allowlist", () => {
  it("answers 429 with CORS headers once the MCP budget is spent; OPTIONS is never limited", async () => {
    vi.stubEnv("SHIPLOG_RATE_LIMIT_MCP", "1");
    const mcp = await import("@/app/api/mcp/route");
    expect((await mcp.POST(mcpPost("198.51.100.7"))).status).toBe(200);
    const res = await mcp.POST(mcpPost("198.51.100.7"));
    expect(res.status).toBe(429);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect((await res.json()).error).toBe("rate_limited");
    expect((await mcp.OPTIONS(fromIp("/api/mcp", "198.51.100.7", { method: "OPTIONS" }))).status).toBe(204);
  });

  it("MCP 429 is not cacheable, and GET, POST and DELETE share the MCP budget", async () => {
    vi.stubEnv("SHIPLOG_RATE_LIMIT_MCP", "2");
    const mcp = await import("@/app/api/mcp/route");
    await mcp.POST(mcpPost("198.51.100.11"));
    await mcp.GET(fromIp("/api/mcp", "198.51.100.11", { headers: { accept: "text/event-stream" } }));
    const res = await mcp.DELETE(fromIp("/api/mcp", "198.51.100.11", { method: "DELETE" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("the MCP and read API budgets are separate", async () => {
    vi.stubEnv("SHIPLOG_RATE_LIMIT_MCP", "1");
    vi.stubEnv("SHIPLOG_RATE_LIMIT_API", "1");
    const mcp = await import("@/app/api/mcp/route");
    const { GET } = await import("@/app/api/v1/changelogs/[namespace]/[repo]/route");
    expect((await mcp.POST(mcpPost("198.51.100.8"))).status).toBe(200);
    expect((await mcp.POST(mcpPost("198.51.100.8"))).status).toBe(429);
    expect((await GET(fromIp("/api/v1/changelogs/acme/demo", "198.51.100.8"), ctx)).status).toBe(200);
    expect((await GET(fromIp("/api/v1/changelogs/acme/demo", "198.51.100.8"), ctx)).status).toBe(429);
  });

  it("MCP defaults to 60 per minute and SHIPLOG_RATE_LIMIT_MCP=0 turns it off", async () => {
    const mcp = await import("@/app/api/mcp/route");
    const codes: number[] = [];
    for (let i = 0; i < 61; i++) codes.push((await mcp.OPTIONS(fromIp("/api/mcp", "198.51.100.12", { method: "OPTIONS" }))).status);
    for (let i = 0; i < 61; i++) codes.push((await mcp.DELETE(fromIp("/api/mcp", "198.51.100.12", { method: "DELETE" }))).status);
    expect(codes.slice(0, 61).every((c) => c === 204)).toBe(true);
    expect(codes.slice(61, 121).every((c) => c !== 429)).toBe(true);
    expect(codes[121]).toBe(429);
    vi.stubEnv("SHIPLOG_RATE_LIMIT_MCP", "0");
    const off: number[] = [];
    for (let i = 0; i < 70; i++) off.push((await mcp.DELETE(fromIp("/api/mcp", "198.51.100.13", { method: "DELETE" }))).status);
    expect(off).not.toContain(429);
  });

  it("with SHIPLOG_MCP_ALLOWED_ORIGINS, browsers from other origins get 403 and allowed ones get their origin echoed", async () => {
    vi.stubEnv("SHIPLOG_MCP_ALLOWED_ORIGINS", "https://app.example, https://agent.example");
    const mcp = await import("@/app/api/mcp/route");
    const bad = await mcp.POST(mcpPost("198.51.100.9", { origin: "https://evil.example" }));
    expect(bad.status).toBe(403);
    expect((await bad.json()).error).toBe("origin_not_allowed");
    const good = await mcp.POST(mcpPost("198.51.100.9", { origin: "https://agent.example" }));
    expect(good.status).toBe(200);
    expect(good.headers.get("access-control-allow-origin")).toBe("https://agent.example");
    expect(good.headers.get("vary")).toContain("Origin");
    // Agents outside a browser send no Origin header and are not affected.
    expect((await mcp.POST(mcpPost("198.51.100.9"))).status).toBe(200);
    const pre = await mcp.OPTIONS(fromIp("/api/mcp", "198.51.100.9", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    const okPre = await mcp.OPTIONS(fromIp("/api/mcp", "198.51.100.9", { method: "OPTIONS", headers: { origin: "https://app.example" } }));
    expect(okPre.headers.get("access-control-allow-origin")).toBe("https://app.example");
  });

  it("allowlist entries match regardless of case and trailing slash; refused origins do not spend the budget; 429 keeps the echoed origin", async () => {
    vi.stubEnv("SHIPLOG_MCP_ALLOWED_ORIGINS", "https://App.Example/");
    vi.stubEnv("SHIPLOG_RATE_LIMIT_MCP", "1");
    const mcp = await import("@/app/api/mcp/route");
    for (let i = 0; i < 3; i++) expect((await mcp.POST(mcpPost("198.51.100.14", { origin: "https://evil.example" }))).status).toBe(403);
    expect((await mcp.POST(mcpPost("198.51.100.14", { origin: "https://app.example" }))).status).toBe(200);
    const limited = await mcp.POST(mcpPost("198.51.100.14", { origin: "https://app.example" }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("access-control-allow-origin")).toBe("https://app.example");
  });

  it("without an allowlist MCP stays open to any origin", async () => {
    const mcp = await import("@/app/api/mcp/route");
    const res = await mcp.POST(mcpPost("198.51.100.10", { origin: "https://anywhere.example" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("limitKey", () => {
  it("keys IPv4 by address and IPv6 by /64", () => {
    expect(limitKey("203.0.113.9")).toBe("203.0.113.9");
    expect(limitKey("2001:db8:abcd:12:1::5")).toBe("2001:db8:abcd:12::/64");
    expect(limitKey("2001:DB8:abcd:0012:ffff:1:2:3")).toBe("2001:db8:abcd:12::/64");
    expect(limitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("two addresses in one IPv6 /64 share a budget on the API", async () => {
    vi.stubEnv("SHIPLOG_RATE_LIMIT_API", "1");
    const { GET } = await import("@/app/api/v1/changelogs/[namespace]/[repo]/route");
    expect((await GET(fromIp("/api/v1/changelogs/acme/demo", "2001:db8:1:2::a"), ctx)).status).toBe(200);
    expect((await GET(fromIp("/api/v1/changelogs/acme/demo", "2001:db8:1:2::b"), ctx)).status).toBe(429);
    expect((await GET(fromIp("/api/v1/changelogs/acme/demo", "2001:db8:1:3::a"), ctx)).status).toBe(200);
  });
});

