// middleware.ts
import { NextRequest, NextResponse } from "next/server";

const ADMIN_ONLY  = ["/admin"];
const ISSUER_ONLY = ["/issuer"];
const AUTH_NEEDED = ["/profile"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Webhook guard
  if (pathname.startsWith("/api/webhooks/meet")) {
    const secret = process.env.GOOGLE_WEBHOOK_SECRET;
    if (secret) {
      const token = req.headers.get("x-goog-channel-token");
      if (!token || token !== secret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    return NextResponse.next();
  }

  // Check sessions
  const walletSession = req.cookies.get("suicert_wallet_session")?.value;
  const googleSession =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;

  const isAuthenticated = !!(walletSession || googleSession);

  // Auth-required routes
  const needsAuth = [...ADMIN_ONLY, ...ISSUER_ONLY, ...AUTH_NEEDED]
    .some((p) => pathname.startsWith(p));

  if (needsAuth && !isAuthenticated) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  // Admin-only routes — check wallet role
  if (ADMIN_ONLY.some((p) => pathname.startsWith(p))) {
    if (!walletSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.searchParams.set("error", "wallet_required_for_admin");
      return NextResponse.redirect(url);
    }
    try {
      const session = JSON.parse(walletSession);
      if (session.role !== "admin") {
        const url = req.nextUrl.clone();
        url.pathname = "/dashboard";
        url.searchParams.set("error", "unauthorized");
        return NextResponse.redirect(url);
      }
    } catch {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/signin";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/issuer/:path*",
    "/profile/:path*",
    "/api/webhooks/:path*",
  ],
};
