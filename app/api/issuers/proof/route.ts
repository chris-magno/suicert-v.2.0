import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getIssuerByWallet, updateIssuerStatus } from "@/lib/supabase";
import { buildSuiTxExplorerUrl, verifyIssuerRegistrationProof } from "@/lib/sui";
import { getVerifiedWalletSession } from "@/lib/wallet/server-auth";
import { consumeRateLimit, getClientIdentifier } from "@/lib/security/rate-limit";

const SUI_TX_DIGEST_REGEX = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const SUI_OBJECT_ID_REGEX = /^0x[a-fA-F0-9]{64}$/;

const ProofSubmissionSchema = z.object({
  txDigest: z.string().regex(SUI_TX_DIGEST_REGEX, "txDigest must be a valid Sui base58 digest"),
  issuerCapId: z.string().regex(SUI_OBJECT_ID_REGEX, "issuerCapId must be a valid Sui object id"),
  explorerUrl: z.string().url("explorerUrl must be a valid URL").optional(),
});

export async function POST(req: NextRequest) {
  try {
    const client = getClientIdentifier(req);
    const limit = consumeRateLimit({
      key: `issuers:proof:${client}`,
      limit: 10,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many proof submissions. Please retry shortly." }, {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      });
    }

    const verifiedSession = await getVerifiedWalletSession(req);
    if (!verifiedSession) return NextResponse.json({ error: "Verified wallet session required" }, { status: 401 });
    const walletAddress = verifiedSession.address;

    const body = await req.json();
    const parsed = ProofSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    const issuer = await getIssuerByWallet(walletAddress).catch(() => null);
    if (!issuer) {
      return NextResponse.json({ error: "Issuer application not found for wallet" }, { status: 404 });
    }

    if (issuer.status !== "pending_onchain") {
      return NextResponse.json({
        error: "Issuer is not in pending_onchain state",
        currentStatus: issuer.status,
      }, { status: 409 });
    }

    const proof = await verifyIssuerRegistrationProof({
      txDigest: parsed.data.txDigest,
      issuerCapId: parsed.data.issuerCapId,
      expectedSender: walletAddress,
    });
    if (!proof.ok) {
      return NextResponse.json({ error: proof.error ?? "Invalid on-chain proof" }, { status: 400 });
    }

    const explorerUrl = parsed.data.explorerUrl ?? buildSuiTxExplorerUrl(parsed.data.txDigest);

    const nowIso = new Date().toISOString();
    await updateIssuerStatus(issuer.id, "approved", {
      issuerCapId: parsed.data.issuerCapId,
      registrationTxDigest: parsed.data.txDigest,
      registrationExplorerUrl: explorerUrl,
      onchainRegisteredAt: nowIso,
    });

    return NextResponse.json({
      success: true,
      issuerId: issuer.id,
      status: "approved",
      registrationTxDigest: parsed.data.txDigest,
      issuerCapId: parsed.data.issuerCapId,
      registrationExplorerUrl: explorerUrl,
      onchainRegisteredAt: nowIso,
    });
  } catch (error) {
    console.error("[POST /api/issuers/proof]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
