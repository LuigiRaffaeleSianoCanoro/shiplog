import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { originConfigured } from "@/lib/origin";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ ok: true, provider: env.llmProvider, byok: env.byokEnabled, origin: originConfigured(), storage: process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID ? "vercel-blob" : env.supabaseUrl ? "supabase" : "memory" });
}
