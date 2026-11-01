import { NextResponse } from "next/server";
import { authorizeCronRequest, runCronPoll } from "@/lib/cronPoll";
import { trackCronRun } from "@/lib/analytics/track";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Called by Vercel Cron and optional external schedulers. Requires `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runCronPoll();
  await trackCronRun(result);
  const { flushServerAnalytics } = await import("@/lib/analytics/server");
  await flushServerAnalytics();
  return NextResponse.json(result);
}
