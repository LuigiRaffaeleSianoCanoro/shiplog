import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { backfillInstallation, backfillRepoHistory } from "@/lib/backfill";
import { getStore } from "@/lib/store";
import { COOKIE, readSession } from "@/lib/session";

export const runtime = "nodejs";

async function authorized(id: string) {
  return readSession((await cookies()).get(COOKIE)?.value) === id;
}

/** Explicit setup action: backfill CHANGELOG from merged PRs and tags (session required). */
export async function POST(req: Request) {
  const { installationId, repo, force } = (await req.json().catch(() => ({}))) as { installationId?: string; repo?: string; force?: boolean };
  if (!installationId) return NextResponse.json({ error: "installationId is required" }, { status: 400 });
  if (!(await authorized(installationId))) return NextResponse.json({ error: "Open this page from the Shiplog install link (session expired)." }, { status: 401 });
  const inst = await getStore().getInstallation(installationId);
  if (!inst || inst.status !== "active") return NextResponse.json({ error: "Unknown or disconnected installation" }, { status: 404 });
  const results = repo ? [await backfillRepoHistory(installationId, repo, Boolean(force))] : await backfillInstallation(installationId, Boolean(force));
  return NextResponse.json({ ok: true, results });
}
