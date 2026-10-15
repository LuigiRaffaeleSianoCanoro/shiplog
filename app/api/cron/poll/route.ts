import { NextResponse } from "next/server";
import { flushBatches, pollAgents } from "@/lib/jobs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Called by Vercel Cron (and opportunistically by the dashboard). Protected by CRON_SECRET when set. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const batches = await flushBatches();
  return NextResponse.json({ updated: await pollAgents(), batches });
}
