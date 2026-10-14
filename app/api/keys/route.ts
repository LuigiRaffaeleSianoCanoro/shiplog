import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStore } from "@/lib/store";
import { last4, parseMasterKey, seal } from "@/lib/crypto";
import { validateCursorKey } from "@/lib/cursor";
import { cookies } from "next/headers";
import { COOKIE, readSession } from "@/lib/session";

async function authorized(id: string) { return readSession((await cookies()).get(COOKIE)?.value) === id; }

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!env.byokEnabled) return NextResponse.json({ error: "Key connection is disabled; Shiplog runs in prompt-only mode." }, { status: 403 });
  const { installationId, key, kind } = (await req.json().catch(() => ({}))) as { installationId?: string; key?: string; kind?: string };
  if (!installationId || !key) return NextResponse.json({ error: "installationId and key are required" }, { status: 400 });
  if (!(await authorized(installationId))) return NextResponse.json({ error: "Open this page from the Shiplog install link (session expired)." }, { status: 401 });
  const store = getStore();
  const inst = await store.getInstallation(installationId);
  if (!inst || inst.status !== "active") return NextResponse.json({ error: "Unknown or disconnected installation" }, { status: 404 });
  const trimmed = key.trim();
  if (!(await validateCursorKey(trimmed).catch(() => false))) return NextResponse.json({ error: "Cursor rejected this key" }, { status: 422 });
  // Rotation: the new key is validated above BEFORE the old one is touched; then it replaces the old record
  // (same path, overwrite) so the old ciphertext no longer exists anywhere.
  const previous = await store.getKey(installationId);
  const now = new Date().toISOString();
  const sealed = seal(trimmed, parseMasterKey(env.encKey), installationId);
  const keyKind = kind === "service_account" ? "service_account" : "personal";
  await store.putKey({ ...sealed, installationId, last4: last4(trimmed), kind: keyKind, createdAt: now, rotatedAt: previous ? now : null });
  return NextResponse.json({ ok: true, last4: last4(trimmed), kind: keyKind, rotated: !!previous });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("installation_id");
  if (!id) return NextResponse.json({ error: "installation_id required" }, { status: 400 });
  if (!(await authorized(id))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await getStore().deleteKey(id);
  return NextResponse.json({ ok: true });
}
