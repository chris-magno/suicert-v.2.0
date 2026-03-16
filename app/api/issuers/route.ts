// app/api/issuers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { IssuerApplicationSchema } from "@/lib/validators";
import { verifyIssuer } from "@/lib/ai";
import { createIssuer, getIssuers, updateIssuerStatus, getIssuerByWallet } from "@/lib/supabase";
import { isAdminWalletSession } from "@/lib/wallet/server-auth";

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const result = IssuerApplicationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Validation failed", details: result.error.flatten() }, { status: 400 });
    }
    const data     = result.data;
    const aiResult = await verifyIssuer(data);

    let walletAddress = data.suiWalletAddress || undefined;
    if (!walletAddress) {
      const walletCookie = req.cookies.get("suicert_wallet_session")?.value;
      if (walletCookie) {
        try {
          const ws = JSON.parse(walletCookie);
          if (typeof ws?.address === "string" && ws.address.startsWith("0x")) {
            walletAddress = ws.address;
          }
        } catch {
          // Ignore malformed cookie and continue without wallet address.
        }
      }
    }

    if (walletAddress) {
      const existing = await getIssuerByWallet(walletAddress).catch(() => null);
      if (existing) {
        return NextResponse.json({ error: "This wallet already has an issuer application", issuer: existing }, { status: 409 });
      }
    }

    const issuer = await createIssuer({
      walletAddress,
      email: data.email, name: data.name, organization: data.organization,
      website: data.website, description: data.description,
      aiScore: aiResult.score, aiSummary: aiResult.summary,
      status: "pending",
    });

    return NextResponse.json({ success: true, issuer, aiResult }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/issuers]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const isAdmin = await isAdminWalletSession(req);
    if (!isAdmin) return NextResponse.json({ error: "Admin wallet authorization required" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const issuers = await getIssuers(searchParams.get("status") ?? undefined);
    return NextResponse.json(issuers);
  } catch {
    return NextResponse.json([]);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const isAdmin = await isAdminWalletSession(req);
    if (!isAdmin) return NextResponse.json({ error: "Admin wallet authorization required" }, { status: 403 });

    const { id, status, issuerCapId, registrationTxDigest, onchainRegisteredAt } = await req.json();
    if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });
    await updateIssuerStatus(id, status, { issuerCapId, registrationTxDigest, onchainRegisteredAt });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/issuers]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
