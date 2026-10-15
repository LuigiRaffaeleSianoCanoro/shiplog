import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { dedupeWebhooks, isValidNotifyWebhookUrl } from "@/lib/notify";
import { cookies } from "next/headers";
import { COOKIE, readSession } from "@/lib/session";

async function authorized(id: string) { return readSession((await cookies()).get(COOKIE)?.value) === id; }

export const runtime = "nodejs";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("installation_id");
  if (!id) return NextResponse.json({ error: "installation_id required" }, { status: 400 });
  if (!(await authorized(id))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const store = getStore();
  const inst = await store.getInstallation(id);
  if (!inst || inst.status !== "active") return NextResponse.json({ error: "Unknown or disconnected installation" }, { status: 404 });
  const webhooks = await store.getNotifyWebhooks(id);
  return NextResponse.json({ webhooks });
}

export async function POST(req: Request) {
  const { installationId, webhooks } = (await req.json().catch(() => ({}))) as { installationId?: string; webhooks?: unknown };
  if (!installationId || !Array.isArray(webhooks)) return NextResponse.json({ error: "installationId and webhooks[] are required" }, { status: 400 });
  if (!(await authorized(installationId))) return NextResponse.json({ error: "Open this page from the Shiplog install link (session expired)." }, { status: 401 });
  const store = getStore();
  const inst = await store.getInstallation(installationId);
  if (!inst || inst.status !== "active") return NextResponse.json({ error: "Unknown or disconnected installation" }, { status: 404 });
  const cleaned = dedupeWebhooks(webhooks.map((w) => String(w)));
  const bad = webhooks.map((w) => String(w).trim()).filter((w) => w && !isValidNotifyWebhookUrl(w));
  if (bad.length) return NextResponse.json({ error: "Each webhook must be a valid https URL", invalid: bad.length }, { status: 400 });
  await store.putNotifyWebhooks(installationId, cleaned);
  return NextResponse.json({ ok: true, webhooks: cleaned });
}
