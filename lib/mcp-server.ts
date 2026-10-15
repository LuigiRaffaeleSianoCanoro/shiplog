import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";
import { mcpToolHandlers } from "./mcp-tools";
import type { Store } from "./store";

export function createShiplogMcpServer(store: Store, origin: string): McpServer {
  const server = new McpServer({ name: "shiplog", version: "1.0.0" });
  const ns = z.string().min(1).describe("Origin namespace (same as public changelog URL)");
  const repo = z.string().min(1).describe("Repository name without namespace");
  const changelog = z.string().optional().describe("Monorepo changelog path, for example packages/web/CHANGELOG.md");

  server.registerTool(
    "get_changelog",
    {
      description: "Read the full structured changelog for a repo (same visibility as the public changelog page).",
      inputSchema: { namespace: ns, repo, changelog },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => mcpToolHandlers.get_changelog(store, origin, args),
  );

  server.registerTool(
    "get_release",
    {
      description: "Read one released version from a changelog.",
      inputSchema: { namespace: ns, repo, version: z.string().min(1), changelog },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => mcpToolHandlers.get_release(store, origin, args),
  );

  server.registerTool(
    "list_packages",
    {
      description: "List monorepo changelog files stored for a repo (root plus package paths).",
      inputSchema: { namespace: ns, repo },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => mcpToolHandlers.list_packages(store, origin, args),
  );

  return server;
}

/** Stateless Streamable HTTP handler for Next.js route handlers. */
export async function handleMcpRequest(req: Request, store: Store, origin: string): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createShiplogMcpServer(store, origin);
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  return res;
}
