import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getStore } from "@/lib/store";
import { COOKIE, readSession } from "@/lib/session";
import { flushRepoNow } from "@/lib/jobs";

export const runtime = "nodejs";

/**
 * Dashboard "Run batch now" (backlog 10). A plain HTML form post, so it works without client JS.
 * Spends the installation's Cursor key, so only that installation's session may call it (not the operator token).
 * The session cookie is SameSite=Lax, and a cross-site Origin is refused as well.
 */
/** The origin the browser sees, also behind a TLS-terminating proxy (x-forwarded-*). */
function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  const self = publicOrigin(req);
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== self) return NextResponse.json({ error: "cross-site request refused" }, { status: 403 });
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
  const back = new URL("/dashboard", self);
  back.searchParams.set("installation_id", installationId);
  back.searchParams.set("flush", r.status);
  back.searchParams.set("repo", repo);
  if (r.status === "launched") { back.searchParams.set("prs", String(r.prs)); back.searchParams.set("runs", String(r.agentRuns)); }
  back.hash = "release-preview";
  return NextResponse.redirect(back, 303);
}
