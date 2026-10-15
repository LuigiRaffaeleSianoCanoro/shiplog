import { handleMcpRequest } from "@/lib/mcp-server";
import { requestOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MCP_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: MCP_HEADERS });
}

export async function GET(req: Request) {
  const res = await handleMcpRequest(req, getStore(), await requestOrigin());
  return withCors(res);
}

export async function POST(req: Request) {
  const res = await handleMcpRequest(req, getStore(), await requestOrigin());
  return withCors(res);
}

export async function DELETE(req: Request) {
  const res = await handleMcpRequest(req, getStore(), await requestOrigin());
  return withCors(res);
}

function withCors(res: Response) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(MCP_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
