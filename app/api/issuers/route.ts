// app/api/issuers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { IssuerApplicationSchema } from "@/lib/validators";
import { verifyIssuer } from "@/lib/ai";
import { createIssuer, getIssuers, updateIssuerStatus, getIssuerByWallet, isWalletBoundToUser } from "@/lib/supabase";
import { isAdminWalletSession } from "@/lib/wallet/server-auth";
import { requireSuiCertWriteGates } from "@/lib/auth/gates";

export async function POST(req: NextRequest) {
  try {
    const gates = await requireSuiCertWriteGates(req, { requireFreshSignature: true });
    if (!gates.ok) return gates.response;

    const walletBound = await isWalletBoundToUser(gates.context.userId, gates.context.walletAddress).catch(() => false);
    if (!walletBound) {
      return NextResponse.json({
        error: "Wallet must be bound to your account before applying as issuer",
        code: "WALLET_NOT_BOUND",
      }, { status: 403 });
    }

    const body   = await req.json();
    const result = IssuerApplicationSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Validation failed", details: result.error.flatten() }, { status: 400 });
    }
    const data     = result.data;
    const aiResult = await verifyIssuer(data);

    const walletAddress = gates.context.walletAddress;

    if (walletAddress) {
      const existing = await getIssuerByWallet(walletAddress).catch(() => null);
      if (existing) {
        return NextResponse.json({ error: "This wallet already has an issuer application", issuer: existing }, { status: 409 });
      }
    }

    const issuer = await createIssuer({
      walletAddress,
      email: gates.context.userEmail ?? data.email, name: data.name, organization: data.organization,
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
