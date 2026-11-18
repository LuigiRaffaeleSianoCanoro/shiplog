import { getPackagesApiResponse, jsonResponse } from "@/lib/changelog-api-http";
import { scheduleApiRead } from "@/lib/analytics/track";
import { getStore } from "@/lib/store";

export const revalidate = 300;

type Ctx = { params: Promise<{ namespace: string; repo: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { namespace, repo } = await ctx.params;
  const payload = await getPackagesApiResponse(namespace, repo, getStore());
  if (!payload) return jsonResponse({ error: "not_found" }, 404);
  scheduleApiRead("packages", payload.repo, req.headers.get("user-agent"));
  return jsonResponse(payload);
}
