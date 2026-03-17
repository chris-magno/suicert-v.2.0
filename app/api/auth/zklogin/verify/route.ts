import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createAuthAuditLog, getUserIdentityByUserId, upsertUserIdentity } from "@/lib/supabase";
import { normalizeSuiAddress, sameSuiAddress } from "@/lib/wallet/address";
import { getZkLoginVerifier } from "@/lib/zklogin/verifier";

const ZkLoginProofEnvelopeSchema = z.object({
  bytes: z.string().min(1),
  signature: z.string().min(1),
  address: z.string().optional(),
  maxEpoch: z.union([z.string(), z.number()]).optional(),
  userSignature: z.string().optional(),
  proofInputs: z.record(z.string(), z.unknown()).optional(),
});

const VerifyZkProofSchema = z.object({
  proof: ZkLoginProofEnvelopeSchema,
  expectedAddress: z.string().optional(),
  requestId: z.string().optional(),
});

async function auditSafely(input: {
  userId?: string;
  authProvider?: string;
  walletAddress?: string;
  event: string;
  details?: Record<string, unknown>;
}) {
  await createAuthAuditLog(input).catch(() => {});
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const identity = await getUserIdentityByUserId(userId).catch(() => null);
  return NextResponse.json({
    ok: true,
    mode: "skeleton",
    identity,
    verifier: {
      contractVersion: "v1",
      failClosed: true,
      requiredFields: ["proof.bytes", "proof.signature"],
      optionalFields: ["proof.address", "proof.maxEpoch", "proof.userSignature", "proof.proofInputs", "expectedAddress", "requestId"],
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = VerifyZkProofSchema.safeParse(body);
  if (!parsed.success) {
    await auditSafely({
      userId,
      authProvider: "zklogin",
      event: "zklogin_verify_validation_failed",
      details: { issues: parsed.error.issues.length },
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const normalizedExpected = parsed.data.expectedAddress
    ? normalizeSuiAddress(parsed.data.expectedAddress)
    : null;

  await auditSafely({
    userId,
    authProvider: "zklogin",
    walletAddress: normalizedExpected ?? parsed.data.proof.address,
    event: "zklogin_verify_requested",
    details: {
      requestId: parsed.data.requestId,
      hasAddressHint: Boolean(parsed.data.proof.address),
      hasProofInputs: Boolean(parsed.data.proof.proofInputs),
    },
  });

  const verifier = getZkLoginVerifier();
  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet").toLowerCase();

  const verifyResult = await verifier.verify({
    proof: parsed.data.proof,
    expectedAddress: normalizedExpected ?? undefined,
    network,
  });

  if (!verifyResult.verified) {
    await auditSafely({
      userId,
      authProvider: "zklogin",
      walletAddress: normalizedExpected ?? parsed.data.proof.address,
      event: "zklogin_verify_rejected",
      details: {
        requestId: parsed.data.requestId,
        code: verifyResult.code,
        reason: verifyResult.reason,
        verifierId: verifyResult.verifierId,
      },
    });

    // Fail closed: do not link identity unless proof is cryptographically verified.
    return NextResponse.json(
      {
        ok: false,
        code: verifyResult.code,
        reason: verifyResult.reason ?? "zkLogin proof verification failed",
        verifierId: verifyResult.verifierId,
      },
      { status: verifyResult.code === "NOT_IMPLEMENTED" ? 501 : 401 }
    );
  }

  const verifiedAddress = verifyResult.normalizedAddress
    ? normalizeSuiAddress(verifyResult.normalizedAddress)
    : null;

  if (!verifiedAddress) {
    await auditSafely({
      userId,
      authProvider: "zklogin",
      event: "zklogin_verify_fail_closed",
      details: {
        requestId: parsed.data.requestId,
        reason: "verifier returned verified=true without normalizedAddress",
        verifierId: verifyResult.verifierId,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        code: "VERIFIER_ERROR",
        reason: "Verifier returned invalid successful payload",
      },
      { status: 500 }
    );
  }

  if (normalizedExpected && !sameSuiAddress(verifiedAddress, normalizedExpected)) {
    await auditSafely({
      userId,
      authProvider: "zklogin",
      walletAddress: verifiedAddress,
      event: "zklogin_verify_address_mismatch",
      details: {
        requestId: parsed.data.requestId,
        verifiedAddress,
        expectedAddress: normalizedExpected,
        verifierId: verifyResult.verifierId,
      },
    });

    return NextResponse.json(
      {
        ok: false,
        code: "ADDRESS_MISMATCH",
        reason: "Verified zkLogin address does not match expected address",
      },
      { status: 401 }
    );
  }

  const identity = await upsertUserIdentity({
    userId,
    authProvider: "zklogin",
    zkloginAddress: verifiedAddress,
  });

  await auditSafely({
    userId,
    authProvider: "zklogin",
    walletAddress: verifiedAddress,
    event: "zklogin_verify_succeeded",
    details: {
      requestId: parsed.data.requestId,
      verifierId: verifyResult.verifierId,
      code: verifyResult.code,
    },
  });

  return NextResponse.json({
    ok: true,
    mode: "skeleton",
    verified: true,
    linked: true,
    zkloginAddress: identity.zkloginAddress,
    verifierId: verifyResult.verifierId,
  });
}
