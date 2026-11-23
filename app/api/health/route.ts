import { NextResponse } from "next/server";
import { buildHealthPayload } from "@/lib/health-payload";

export const dynamic = "force-dynamic";

export async function GET() {
  const { status, body } = await buildHealthPayload();
  return NextResponse.json(body, { status });
}
