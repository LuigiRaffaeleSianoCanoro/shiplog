import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicPathShouldReject } from "./edge/public-path-guard";

export function middleware(req: NextRequest) {
  if (publicPathShouldReject(req.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  /** Only two-segment public paths (changelog slugs); skips /, /dashboard, /api, static assets. */
  matcher: [
    "/((?!api|_next|ingest|dashboard|setup|privacy|brand|favicon.ico|.*\\.(?:svg|png|ico|webp)$)[^/]+/[^/]+.*)",
  ],
};
