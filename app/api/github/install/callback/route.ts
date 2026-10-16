import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStore } from "@/lib/store";
import { COOKIE, signSession } from "@/lib/session";
import { getGithubInstallationInfo, githubConfigured } from "@/lib/github";

export const runtime = "nodejs";

/**
 * GitHub redirects here after install (Setup URL in the GitHub App settings).
 * Query: installation_id, setup_action, state (optional).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id");
  if (!installationId) return NextResponse.json({ error: "missing installation_id" }, { status: 400 });
  if (!env.githubAppId) return NextResponse.json({ error: "GITHUB_APP_ID is not configured yet" }, { status: 503 });

  const state = url.searchParams.get("state");
  const expected = req.headers.get("cookie")?.match(/(?:^|;\s*)shiplog_github_state=([^;]+)/)?.[1];
  if ((expected || state) && state !== expected) {
    return NextResponse.json({ error: "state mismatch (start the install again from Shiplog)" }, { status: 401 });
  }

  const store = getStore();
  const existing = await store.getInstallation(installationId);
  let namespace = existing?.namespace || "";
  let namespaceType = existing?.namespaceType ?? null;
  let installerId = existing?.installerId ?? null;
  if ((!namespace || !namespaceType) && githubConfigured()) {
    try {
      const info = await getGithubInstallationInfo(installationId);
      namespace = namespace || info.namespace;
      namespaceType = namespaceType ?? info.namespaceType;
      installerId = installerId ?? info.installerId;
    } catch (e) {
      console.error("[shiplog] github installation lookup failed:", (e as Error).message);
    }
  }

  await store.upsertInstallation({
    ...existing,
    id: installationId,
    provider: "github",
    namespace,
    namespaceType,
    status: "active",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    disconnectedAt: null,
    installerId,
  });

  const res = NextResponse.redirect(new URL(`/setup?installation_id=${encodeURIComponent(installationId)}`, url.origin));
  res.cookies.set(COOKIE, signSession(installationId), {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  res.cookies.set("shiplog_github_state", "", { path: "/api/github/install", maxAge: 0 });
  return res;
}
