import { after, NextResponse } from "next/server";
import { verifyOriginWebhook } from "@/lib/webhook";
import { getStore } from "@/lib/store";
import { handleEvent, type Envelope } from "@/lib/jobs";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = Buffer.from(await req.arrayBuffer());
  let deliveryId = req.headers.get("webhook-id") ?? "";
  if (!env.insecureWebhooks) {
    const v = await verifyOriginWebhook(raw, req.headers);
    if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 401 });
    deliveryId = v.id;
  }
  let body: Envelope;
  try { body = JSON.parse(raw.toString("utf8")); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  deliveryId ||= body.deliveryId ?? "";
  if (!deliveryId) return NextResponse.json({ error: "missing delivery id" }, { status: 400 });
  if (!(await getStore().claimDelivery(deliveryId))) return NextResponse.json({ ok: true, duplicate: true });
  // Return 2xx fast (Origin waits 10s); do the work after the response.
  after(() => handleEvent(body, deliveryId).catch((e) => console.error("[shiplog] job error:", e.message)));
  return NextResponse.json({ ok: true }, { status: 202 });
}
