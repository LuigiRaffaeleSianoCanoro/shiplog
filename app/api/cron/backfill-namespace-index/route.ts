import { NextResponse } from "next/server";
import { withStoreAuth } from "@/lib/changelog-api-http";
import { authorizeCronRequest } from "@/lib/cronPoll";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Weekly rebuild of namespace→installation index blobs (vercel.json, Mondays 09:30 UTC). Requires CRON_SECRET. */
export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return withStoreAuth(async () => {
    const written = await getStore().backfillNamespaceIndex();
    return NextResponse.json({ ok: true, written }, { headers: { "cache-control": "no-store" } });
  });
}
