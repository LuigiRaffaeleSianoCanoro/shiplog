import { getChangelogApiResponse, jsonResponse, withStoreAuth } from "@/lib/changelog-api-http";
import { scheduleApiRead } from "@/lib/analytics/track";
import { publicSiteOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const revalidate = 300;

type Ctx = { params: Promise<{ namespace: string; repo: string }> };

export async function GET(req: Request, ctx: Ctx) {
  return withStoreAuth(async () => {
    const { namespace, repo } = await ctx.params;
    const origin = publicSiteOrigin();
    const payload = await getChangelogApiResponse(namespace, repo, getStore(), origin, new URL(req.url).searchParams);
    if (!payload) return jsonResponse({ error: "not_found" }, 404);
    scheduleApiRead("changelog", payload.repo, req.headers.get("user-agent"));
    return jsonResponse(payload);
  });
}
