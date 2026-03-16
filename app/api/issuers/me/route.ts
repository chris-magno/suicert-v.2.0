// app/api/issuers/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIssuerByWallet, getIssuerByEmail } from "@/lib/supabase";
import { getVerifiedWalletSession } from "@/lib/wallet/server-auth";

export async function GET(req: NextRequest) {
  try {
    const ws = await getVerifiedWalletSession(req);
    if (ws?.address) {
      const issuer = await getIssuerByWallet(ws.address).catch(() => null);
      return NextResponse.json({ issuer, authenticated: true, authType: "wallet", walletAddress: ws.address, role: ws.role });
    }
    const session = await auth();
    if (session?.user?.email) {
      const issuer = await getIssuerByEmail(session.user.email).catch(() => null);
      return NextResponse.json({
        issuer, authenticated: true, authType: "google",
        user: { email: session.user.email, name: session.user.name, image: session.user.image },
        role: issuer?.status === "approved" ? "issuer" : "user",
      });
    }
    return NextResponse.json({ issuer: null, authenticated: false, role: "guest" });
  } catch {
    return NextResponse.json({ issuer: null, authenticated: false, role: "guest" });
  }
}
