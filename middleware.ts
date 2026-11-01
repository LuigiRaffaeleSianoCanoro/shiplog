import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicPathShouldReject } from "@/lib/public-path-guard";

export function middleware(req: NextRequest) {
  if (publicPathShouldReject(req.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico|webp)$).*)"],
};
