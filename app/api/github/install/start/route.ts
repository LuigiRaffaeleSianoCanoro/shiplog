import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { githubInstallUrl } from "@/lib/github-install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start a GitHub App install: anti-forgery state cookie, redirect to GitHub. */
export async function GET(req: Request) {
  if (!env.githubAppId) return NextResponse.json({ error: "GITHUB_APP_ID is not configured yet" }, { status: 503 });
  const origin = new URL(req.url).origin;
  if (env.installOrigin && env.installOrigin !== origin) {
    return NextResponse.redirect(`${env.installOrigin}/api/github/install/start`, 307);
  }
  const state = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(await githubInstallUrl(state));
  res.cookies.set("shiplog_github_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/api/github/install",
    maxAge: 900,
  });
  return res;
}
