// app/api/issuers/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIssuerByWallet, getIssuerByEmail } from "@/lib/supabase";
import { getVerifiedWalletSession } from "@/lib/wallet/server-auth";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user as { id?: string; email?: string; name?: string; image?: string } | undefined;

    const ws = await getVerifiedWalletSession(req);
    if (ws?.address) {
      const issuerByWallet = await getIssuerByWallet(ws.address).catch(() => null);
      const issuerByEmail = user?.email ? await getIssuerByEmail(user.email).catch(() => null) : null;
      const issuer = issuerByWallet ?? issuerByEmail;
      return NextResponse.json({
        issuer,
        authenticated: true,
        authType: "wallet",
        walletAddress: ws.address,
        user: user?.email
          ? { email: user.email, name: user.name, image: user.image }
          : undefined,
        role: ws.role,
      });
    }

    if (user?.email) {
      const issuer = await getIssuerByEmail(user.email).catch(() => null);
      return NextResponse.json({
        issuer,
        authenticated: true,
        authType: "google",
        user: { email: user.email, name: user.name, image: user.image },
        role: issuer?.status === "approved" ? "issuer" : "user",
      });
    }

    return NextResponse.json({ issuer: null, authenticated: false, role: "guest" });
  } catch {
    return NextResponse.json({ issuer: null, authenticated: false, role: "guest" });
  }
}
