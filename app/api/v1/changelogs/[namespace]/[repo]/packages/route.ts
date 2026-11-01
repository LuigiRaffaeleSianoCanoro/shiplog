import { getPackagesApiResponse, jsonResponse } from "@/lib/changelog-api-http";
import { getStore } from "@/lib/store";

export const revalidate = 300;

type Ctx = { params: Promise<{ namespace: string; repo: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { namespace, repo } = await ctx.params;
  const payload = await getPackagesApiResponse(namespace, repo, getStore());
  if (!payload) return jsonResponse({ error: "not_found" }, 404);
  return jsonResponse(payload);
}
