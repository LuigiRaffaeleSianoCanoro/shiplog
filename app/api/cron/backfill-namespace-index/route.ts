import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cronPoll";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-time or periodic rebuild of namespace→installation index blobs. Requires CRON_SECRET. */
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const written = await getStore().backfillNamespaceIndex();
  return NextResponse.json({ ok: true, written });
}
