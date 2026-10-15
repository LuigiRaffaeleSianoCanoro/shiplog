import { after, NextResponse } from "next/server";
import { verifyGitHubWebhook } from "@/lib/github-webhook";
import { githubToEnvelope } from "@/lib/github-adapter";
import { getStore } from "@/lib/store";
import { handleEvent } from "@/lib/jobs";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

async function markGithubInstall(installationId: string, body: any) {
  const store = getStore();
  const existing = await store.getInstallation(installationId);
  const namespace =
    body?.installation?.account?.login ??
    body?.repository?.owner?.login ??
    existing?.namespace ??
    "";
  await store.upsertInstallation({
    ...(existing ?? { id: installationId, namespace: "", createdAt: new Date().toISOString() }),
    id: installationId,
    provider: "github",
    namespace: namespace || existing?.namespace || "",
    status: existing?.status ?? "active",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  const event = req.headers.get("x-github-event") ?? "";
  let deliveryId = req.headers.get("x-github-delivery") ?? "";
  if (!env.insecureWebhooks) {
    const v = verifyGitHubWebhook(raw, req.headers, env.githubWebhookSecret);
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 401 });
    deliveryId = v.deliveryId;
  }
  let body: any;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!deliveryId) return NextResponse.json({ error: "missing delivery id" }, { status: 400 });
  if (!(await getStore().claimDelivery(deliveryId))) return NextResponse.json({ ok: true, duplicate: true });

  const envelope = githubToEnvelope(event, body);
  if (!envelope) return NextResponse.json({ ok: true, ignored: true }, { status: 202 });

  after(() =>
    (async () => {
      if (envelope.installationId) await markGithubInstall(envelope.installationId, body);
      await handleEvent(envelope, deliveryId);
    })().catch((e) => console.error("[shiplog] github job error:", (e as Error).message)),
  );
  return NextResponse.json({ ok: true }, { status: 202 });
}
