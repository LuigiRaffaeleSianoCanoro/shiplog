import { notFound } from "next/navigation";
import { buildJsonFeed, buildPublicMeta, loadPublicChangelog } from "@/lib/public-changelog";
import { scheduleFeedRead } from "@/lib/analytics/track";
import { publicSiteOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const revalidate = 300;

type Ctx = { params: Promise<{ namespace: string; repo: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { namespace, repo } = await ctx.params;
  const loaded = await loadPublicChangelog(namespace, repo, getStore());
  if (loaded.status === "store_unavailable") {
    return new Response(JSON.stringify({ error: "store_unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (loaded.status === "not_found") notFound();
  const data = loaded.data;
  scheduleFeedRead("json", data.repoSlug, req.headers.get("user-agent"));
  const origin = publicSiteOrigin();
  const meta = buildPublicMeta(origin, namespace, repo);
  const body = JSON.stringify(buildJsonFeed(data.document, meta), null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
