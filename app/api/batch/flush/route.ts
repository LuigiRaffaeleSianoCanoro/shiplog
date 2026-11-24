import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getStore } from "@/lib/store";
import { COOKIE, readSession } from "@/lib/session";
import { flushRepoNow } from "@/lib/jobs";

export const runtime = "nodejs";

/**
 * Same-site check. The browser's Origin must name the host it sent the request to (the Host header, which proxies such as
 * Vercel keep), or the configured public origin. No x-forwarded-* trust: a direct caller could set those.
 */
function sameSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return true; // SameSite=Lax already keeps the session cookie off cross-site posts
  if (origin === "null") return false;
  const configured = process.env.SHIPLOG_INSTALL_ORIGIN?.replace(/\/+$/, "");
  if (configured && origin === configured) return true;
  try { return new URL(origin).host === (req.headers.get("host") ?? new URL(req.url).host); } catch { return false; }
}

/**
 * Dashboard "Run batch now" (backlog 10). A plain HTML form post, so it works without client JS.
 * Spends the installation's Cursor key, so only that installation's session may call it (not the operator token).
 */
export async function POST(req: Request) {
  if (!sameSite(req)) return NextResponse.json({ error: "cross-site request refused" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const installationId = String(form?.get("installationId") ?? "");
  const repo = String(form?.get("repo") ?? "");
  if (!installationId || !repo) return NextResponse.json({ error: "installationId and repo are required" }, { status: 400 });
  if (readSession((await cookies()).get(COOKIE)?.value) !== installationId) {
    return NextResponse.json({ error: "Open the dashboard from your Shiplog install link (session expired)." }, { status: 401 });
  }
  const inst = await getStore().getInstallation(installationId);
  if (!inst || inst.status !== "active") return NextResponse.json({ error: "Unknown or disconnected installation" }, { status: 404 });
  const r = await flushRepoNow(installationId, repo);
  const q = new URLSearchParams({ installation_id: installationId, flush: r.status, repo });
  if (r.status === "launched") { q.set("prs", String(r.prs)); q.set("runs", String(r.agentRuns)); if (r.failedRuns) q.set("failed", String(r.failedRuns)); }
  // Relative Location: the redirect can never point at another host.
  return new Response(null, { status: 303, headers: { location: `/dashboard?${q}#release-preview`, "cache-control": "no-store" } });
}
