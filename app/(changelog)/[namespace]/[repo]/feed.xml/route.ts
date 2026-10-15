import { notFound } from "next/navigation";
import { buildPublicMeta, buildRssFeed, resolvePublicChangelog } from "@/lib/public-changelog";
import { requestOrigin } from "@/lib/request-origin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ namespace: string; repo: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { namespace, repo } = await ctx.params;
  const data = await resolvePublicChangelog(namespace, repo, getStore());
  if (!data) notFound();
  const origin = await requestOrigin();
  const meta = buildPublicMeta(origin, namespace, repo);
  const xml = buildRssFeed(data.document, meta);
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
