import { notFound } from "next/navigation";
import { buildJsonFeed, buildPublicMeta, resolvePublicChangelog } from "@/lib/public-changelog";
import { requestOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const revalidate = 300;

type Ctx = { params: Promise<{ namespace: string; repo: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { namespace, repo } = await ctx.params;
  const data = await resolvePublicChangelog(namespace, repo, getStore());
  if (!data) notFound();
  const origin = await requestOrigin();
  const meta = buildPublicMeta(origin, namespace, repo);
  const body = JSON.stringify(buildJsonFeed(data.document, meta), null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
