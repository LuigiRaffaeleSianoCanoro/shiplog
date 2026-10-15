import { NextResponse } from "next/server";
import { authorizeCronRequest, runCronPoll } from "@/lib/cronPoll";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Called by Vercel Cron and optional external schedulers. Requires `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runCronPoll());
}
