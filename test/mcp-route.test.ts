import { beforeEach, describe, expect, it, vi } from "vitest";
import { addEntry, cutRelease } from "@/lib/changelog";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "shiplog.example" })),
}));

const MCP_ACCEPT = "application/json, text/event-stream";

type JsonRpcWire = { id?: number; result?: unknown; error?: { code: number; message?: string } };

function parseSseJsonRpc(body: string): JsonRpcWire[] {
  const out: JsonRpcWire[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6).trim();
    if (!data || data === "[DONE]") continue;
    try {
      out.push(JSON.parse(data));
    } catch {
      // ignore non-JSON SSE payloads
    }
  }
  return out;
}

function mcpPost(
  handler: (req: Request) => Promise<Response>,
  message: object,
  extraHeaders: Record<string, string> = {},
) {
  return handler(
    new Request("https://shiplog.example/api/mcp", {
      method: "POST",
      headers: {
        accept: MCP_ACCEPT,
        "content-type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(message),
    }),
  );
}

describe("POST /api/mcp (Streamable HTTP)", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { MemoryStore } = await import("@/lib/store/memory");
    const storeMod = await import("@/lib/store");
    storeMod.setStore(new MemoryStore());
  });

  it("initialize returns protocol capabilities over SSE", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await mcpPost(POST, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await res.text();
    const messages = parseSseJsonRpc(body);
    const init = messages.find((m) => m.result !== undefined && m.id === 1) as {
      result: { serverInfo?: { name: string } };
    };
    expect(init?.result?.serverInfo?.name).toBe("shiplog");
  });

  it("tools/list advertises shiplog changelog tools", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await mcpPost(POST, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const body = await res.text();
    const messages = parseSseJsonRpc(body);
    const list = messages.find((m) => m.result !== undefined && m.id === 2) as {
      result: { tools: { name: string }[] };
    };
    const names = list?.result?.tools?.map((t) => t.name).sort();
    expect(names).toEqual(["get_changelog", "get_release", "list_packages"]);
  });

  async function seedChangelog() {
    const { getStore } = await import("@/lib/store");
    const store = getStore();
    await store.upsertInstallation({ id: "i1", namespace: "acme", status: "active", createdAt: "2026-01-01" });
    await store.putChangelog("acme/demo", addEntry(null, "Added", "via MCP (#1)"));
  }

  async function callTool(name: string, args: Record<string, unknown>, id = 10) {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await mcpPost(POST, {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    });
    const body = await res.text();
    const messages = parseSseJsonRpc(body);
    return messages.find((m) => m.result !== undefined && m.id === id) as {
      result: { content: { type: string; text: string }[]; isError?: boolean };
    };
  }

  it("tools/call get_changelog returns public changelog JSON", async () => {
    await seedChangelog();
    const out = await callTool("get_changelog", { namespace: "acme", repo: "demo" });
    expect(out?.result?.isError).toBeFalsy();
    const payload = JSON.parse(out!.result.content[0].text);
    expect(payload.repo).toBe("acme/demo");
    expect(JSON.stringify(payload)).toMatch(/via MCP/);
  });

  it("tools/call get_release returns one version", async () => {
    await seedChangelog();
    const { getStore } = await import("@/lib/store");
    let md = addEntry(null, "Added", "Ship (#2)");
    md = cutRelease(md, "1.0.0", "2026-10-01");
    await getStore().putChangelog("acme/demo", md);
    const out = await callTool("get_release", { namespace: "acme", repo: "demo", version: "1.0.0" }, 11);
    expect(out?.result?.isError).toBeFalsy();
    const release = JSON.parse(out!.result.content[0].text);
    expect(release.version).toBe("1.0.0");
  });

  it("tools/call list_packages lists monorepo paths", async () => {
    await seedChangelog();
    const { getStore } = await import("@/lib/store");
    await getStore().putChangelog("acme/demo::packages/web/CHANGELOG.md", addEntry(null, "Fixed", "pkg (#3)"));
    const out = await callTool("list_packages", { namespace: "acme", repo: "demo" }, 12);
    const listing = JSON.parse(out!.result.content[0].text);
    expect(listing.packages).toEqual([{ changelogPath: "packages/web/CHANGELOG.md" }]);
  });

  it("rejects malformed JSON-RPC body with JSON error", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(
      new Request("https://shiplog.example/api/mcp", {
        method: "POST",
        headers: { accept: MCP_ACCEPT, "content-type": "application/json" },
        body: "{not-json",
      }),
    );
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error?.code).toBe(-32700);
  });

  it("rejects JSON-RPC messages that fail schema validation", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await mcpPost(POST, { jsonrpc: "1.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.error?.code).toBe(-32700);
  });

  it("tools/call surfaces errors for unknown tool names", async () => {
    await seedChangelog();
    const out = await callTool("no_such_tool", { namespace: "acme", repo: "demo" }, 20);
    expect(out?.result?.isError).toBe(true);
    expect(out?.result?.content[0].text).toMatch(/unknown|not found/i);
  });

  it("rejects POST when Accept omits event-stream", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(
      new Request("https://shiplog.example/api/mcp", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
    );
    expect(res.status).toBe(406);
  });

  it("rejects POST with non-JSON content type", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(
      new Request("https://shiplog.example/api/mcp", {
        method: "POST",
        headers: { accept: MCP_ACCEPT, "content-type": "text/plain" },
        body: "hello",
      }),
    );
    expect(res.status).toBe(415);
  });

  it("OPTIONS returns CORS preflight headers", async () => {
    const { OPTIONS } = await import("@/app/api/mcp/route");
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toMatch(/POST/);
  });

  it("rejects unknown JSON-RPC methods", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await mcpPost(POST, { jsonrpc: "2.0", id: 30, method: "nope/method", params: {} });
    const body = await res.text();
    const messages = parseSseJsonRpc(body);
    const err = messages.find((m) => m.error !== undefined && m.id === 30);
    expect(err?.error?.code).toBeDefined();
  });

  it("GET without event-stream Accept is not acceptable", async () => {
    const { GET } = await import("@/app/api/mcp/route");
    const res = await GET(new Request("https://shiplog.example/api/mcp", { method: "GET" }));
    expect(res.status).toBe(406);
  });

  it.todo("returns store_unavailable over MCP when Blob auth fails (needs PR #62)");
});
