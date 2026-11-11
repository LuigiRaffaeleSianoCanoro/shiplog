import {
  buildChangelogApiPayload,
  findRelease,
  listPublicPackagePaths,
  resolveReadableChangelog,
} from "./changelog-read";
import type { Store } from "./store";
import { isStoreAuthError } from "./store/store-auth-error";

export interface McpTextResult extends Record<string, unknown> {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const MCP_STORE_UNAVAILABLE: McpTextResult = {
  isError: true,
  content: [{ type: "text", text: JSON.stringify({ error: "store_unavailable" }) }],
};

export async function withMcpStoreAuth(work: () => Promise<McpTextResult>): Promise<McpTextResult> {
  try {
    return await work();
  } catch (err) {
    if (isStoreAuthError(err)) return MCP_STORE_UNAVAILABLE;
    throw err;
  }
}

export const mcpToolHandlers = {
  async get_changelog(
    store: Store,
    origin: string,
    args: { namespace: string; repo: string; changelog?: string },
  ): Promise<McpTextResult> {
    return withMcpStoreAuth(async () => {
      const resolved = await resolveReadableChangelog(args.namespace, args.repo, store, args.changelog ?? null);
      if (!resolved) {
        return { isError: true, content: [{ type: "text", text: "Changelog not found (unknown slug or inactive installation)." }] };
      }
      const payload = buildChangelogApiPayload(resolved, origin);
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    });
  },

  async get_release(
    store: Store,
    origin: string,
    args: { namespace: string; repo: string; version: string; changelog?: string },
  ): Promise<McpTextResult> {
    return withMcpStoreAuth(async () => {
      const resolved = await resolveReadableChangelog(args.namespace, args.repo, store, args.changelog ?? null);
      if (!resolved) {
        return { isError: true, content: [{ type: "text", text: "Changelog not found (unknown slug or inactive installation)." }] };
      }
      const payload = buildChangelogApiPayload(resolved, origin);
      const release = findRelease(payload, args.version);
      if (!release) {
        return { isError: true, content: [{ type: "text", text: `Release ${args.version} not found.` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(release, null, 2) }] };
    });
  },

  async list_packages(
    store: Store,
    _origin: string,
    args: { namespace: string; repo: string },
  ): Promise<McpTextResult> {
    return withMcpStoreAuth(async () => {
      const resolved = await resolveReadableChangelog(args.namespace, args.repo, store);
      if (!resolved) {
        return { isError: true, content: [{ type: "text", text: "Changelog not found (unknown slug or inactive installation)." }] };
      }
      const keys = await store.listChangelogKeysForRepo(resolved.repoSlug);
      const listing = listPublicPackagePaths(resolved.repoSlug, keys);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ apiVersion: "v1", repo: resolved.repoSlug, ...listing }, null, 2),
          },
        ],
      };
    });
  },
};
