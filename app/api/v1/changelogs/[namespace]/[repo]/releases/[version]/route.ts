import { getReleaseApiResponse, jsonResponse } from "@/lib/changelog-api-http";
import { requestOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ namespace: string; repo: string; version: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { namespace, repo, version } = await ctx.params;
  const origin = await requestOrigin();
  const result = await getReleaseApiResponse(namespace, repo, version, getStore(), origin, new URL(req.url).searchParams);
  if (result.kind === "not_found") return jsonResponse({ error: "not_found" }, 404);
  if (result.kind === "no_release") return jsonResponse({ error: "release_not_found", version }, 404);
  return jsonResponse(result.release);
}
