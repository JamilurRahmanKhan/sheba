import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: sends visitors without a session cookie to /login before any admin page renders.
 * Real authorisation (signature, active user, role) happens in the admin layout and in every /api/admin route.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("seba_session")?.value) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
