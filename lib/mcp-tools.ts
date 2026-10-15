import {
  buildChangelogApiPayload,
  findRelease,
  listPublicPackagePaths,
  resolveReadableChangelog,
} from "./changelog-read";
import type { Store } from "./store";

export interface McpTextResult extends Record<string, unknown> {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export const mcpToolHandlers = {
  async get_changelog(
    store: Store,
    origin: string,
    args: { namespace: string; repo: string; changelog?: string },
  ): Promise<McpTextResult> {
    const resolved = await resolveReadableChangelog(args.namespace, args.repo, store, args.changelog ?? null);
    if (!resolved) {
      return { isError: true, content: [{ type: "text", text: "Changelog not found (unknown slug or inactive installation)." }] };
    }
    const payload = buildChangelogApiPayload(resolved, origin);
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },

  async get_release(
    store: Store,
    origin: string,
    args: { namespace: string; repo: string; version: string; changelog?: string },
  ): Promise<McpTextResult> {
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
  },

  async list_packages(
    store: Store,
    _origin: string,
    args: { namespace: string; repo: string },
  ): Promise<McpTextResult> {
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
  },
};
