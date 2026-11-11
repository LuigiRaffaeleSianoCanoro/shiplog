import { getChangelogApiResponse, jsonResponse, withStoreAuth } from "@/lib/changelog-api-http";
import { trackApiRead } from "@/lib/analytics/track";
import { requestOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const revalidate = 300;

type Ctx = { params: Promise<{ namespace: string; repo: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return withStoreAuth(async () => {
    const { namespace, repo } = await ctx.params;
    const origin = await requestOrigin();
    const payload = await getChangelogApiResponse(namespace, repo, getStore(), origin, new URL(req.url).searchParams);
    if (!payload) return jsonResponse({ error: "not_found" }, 404);
    await trackApiRead("changelog", payload.repo, req.headers.get("user-agent"));
    return jsonResponse(payload);
  });
}
