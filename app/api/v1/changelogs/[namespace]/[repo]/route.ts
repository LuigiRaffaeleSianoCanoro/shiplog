import { getChangelogApiResponse, jsonResponse } from "@/lib/changelog-api-http";
import { requestOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ namespace: string; repo: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { namespace, repo } = await ctx.params;
  const origin = await requestOrigin();
  const payload = await getChangelogApiResponse(namespace, repo, getStore(), origin, new URL(req.url).searchParams);
  if (!payload) return jsonResponse({ error: "not_found" }, 404);
  return jsonResponse(payload);
}
