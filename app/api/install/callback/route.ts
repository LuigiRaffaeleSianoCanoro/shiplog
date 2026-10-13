import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyReceipt } from "@/lib/receipt";
import { getStore } from "@/lib/store";
import { COOKIE, signSession } from "@/lib/session";

export const runtime = "nodejs";

/** Origin redirects here after install with ?installation_receipt=<JWT>. sub = installation id. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jwt = url.searchParams.get("installation_receipt");
  if (!jwt) return NextResponse.json({ error: "missing installation_receipt" }, { status: 400 });
  if (!env.originAppId) return NextResponse.json({ error: "ORIGIN_APP_ID is not configured yet" }, { status: 503 });
  try {
    const r = await verifyReceipt(jwt, env.originAppId);
    const store = getStore();
    const existing = await store.getInstallation(r.sub);
    await store.upsertInstallation({ id: r.sub, namespace: existing?.namespace ?? "", status: "active", createdAt: existing?.createdAt ?? new Date().toISOString(), disconnectedAt: null });
    const res = NextResponse.redirect(new URL(`/setup?installation_id=${encodeURIComponent(r.sub)}`, url.origin));
    res.cookies.set(COOKIE, signSession(r.sub), { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/", maxAge: 3600 });
    return res;
  } catch (e) {
    return NextResponse.json({ error: `invalid receipt: ${(e as Error).message}` }, { status: 401 });
  }
}
