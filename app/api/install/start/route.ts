import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { installUrl } from "@/lib/install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start an install: set an anti-forgery state cookie, redirect to Origin's consent screen. */
export function GET(req: Request) {
  if (!env.originAppId) return NextResponse.json({ error: "ORIGIN_APP_ID is not configured" }, { status: 503 });
  const origin = new URL(req.url).origin;
  // Origin matches redirect_uri exactly against the app's allowlist. Bounce to the registered host so the
  // state cookie is set on the same host the callback will land on.
  if (env.installOrigin && env.installOrigin !== origin) return NextResponse.redirect(`${env.installOrigin}/api/install/start`, 307);
  const state = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(installUrl(origin, state));
  res.cookies.set("shiplog_state", state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/install", maxAge: 900 });
  return res;
}
