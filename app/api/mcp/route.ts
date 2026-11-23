import { handleMcpRequest } from "@/lib/mcp-server";
import { rateLimited } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MCP_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

/** SHIPLOG_MCP_ALLOWED_ORIGINS: comma-separated browser origins. Empty keeps MCP open to any origin. */
function allowedOrigins(): string[] {
  return (process.env.SHIPLOG_MCP_ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/+$/, "").toLowerCase()).filter(Boolean);
}

/** CORS headers for this request, or null when a browser origin is not on the allowlist. */
function corsFor(req: Request): Record<string, string> | null {
  const list = allowedOrigins();
  if (!list.length) return { ...MCP_HEADERS, "Access-Control-Allow-Origin": "*" };
  const origin = req.headers.get("origin");
  if (!origin) return { ...MCP_HEADERS, Vary: "Origin" }; // not a browser: no CORS needed
  return list.includes(origin.toLowerCase().replace(/\/+$/, "")) ? { ...MCP_HEADERS, "Access-Control-Allow-Origin": origin, Vary: "Origin" } : null;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsFor(req) ?? { Vary: "Origin" } });
}

async function handle(req: Request) {
  const cors = corsFor(req);
  if (!cors) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", Vary: "Origin" } });
  }
  const limited = rateLimited(req, "mcp", cors);
  if (limited) return limited;
  const res = await handleMcpRequest(req, getStore(), await requestOrigin());
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) {
    if (k === "Vary") headers.append(k, v);
    else headers.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
