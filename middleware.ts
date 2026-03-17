// middleware.ts
import { NextRequest, NextResponse } from "next/server";

const ADMIN_ONLY  = ["/admin"];
const ISSUER_ONLY = ["/issuer"];
const AUTH_NEEDED = ["/profile"];

interface MiddlewareWalletSession {
  address: string;
  role: "admin" | "issuer" | "user";
}

async function getVerifiedWalletSession(req: NextRequest): Promise<MiddlewareWalletSession | null> {
  const cookie = req.headers.get("cookie");
  if (!cookie || !cookie.includes("suicert_wallet_session=")) return null;

  try {
    const url = new URL("/api/wallet/session", req.url);
    const res = await fetch(url, {
      method: "GET",
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = await res.json();
    const session = body?.session as MiddlewareWalletSession | null | undefined;
    if (!session?.address || !session?.role) return null;
    return session;
  } catch {
    return null;
  }
}

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
  const googleSession =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;
  const hasGoogleSession = Boolean(googleSession);

  const walletSession = await getVerifiedWalletSession(req);

  // User and issuer routes use Google session as the primary identity.
  const needsGoogleAuth = [...ISSUER_ONLY, ...AUTH_NEEDED]
    .some((p) => pathname.startsWith(p));

  if (needsGoogleAuth && !hasGoogleSession) {
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
    if (walletSession.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.searchParams.set("error", "unauthorized");
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
