import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createAuthAuditLog, getUserIdentityByUserId, upsertUserIdentity } from "@/lib/supabase";
import { normalizeSuiAddress, sameSuiAddress } from "@/lib/wallet/address";
import { getZkLoginVerifier } from "@/lib/zklogin/verifier";

const ZkLoginProofEnvelopeSchema = z.object({
  bytes: z.string().min(1),
  signature: z.string().min(1),
  idToken: z.string().min(1).optional(),
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

function toHttpStatus(code: "VERIFIED" | "INVALID_PROOF" | "ADDRESS_MISMATCH" | "VERIFIER_ERROR"): number {
  switch (code) {
    case "INVALID_PROOF":
    case "ADDRESS_MISMATCH":
      return 401;
    case "VERIFIER_ERROR":
      return 502;
    case "VERIFIED":
      return 200;
    default:
      return 401;
  }
}

function classifyVerifyPersistenceError(error: unknown): { status: number; reason: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown verify persistence error");
  const normalized = raw.toLowerCase();

  const mentionsUserIdentitiesSchemaGap =
    normalized.includes("user_identities") &&
    (
      normalized.includes("does not exist") ||
      normalized.includes("relation") ||
      normalized.includes("column") ||
      normalized.includes("could not find the table") ||
      normalized.includes("schema cache")
    );

  const mentionsAuthAuditSchemaGap =
    normalized.includes("auth_audit_logs") &&
    (
      normalized.includes("does not exist") ||
      normalized.includes("relation") ||
      normalized.includes("column") ||
      normalized.includes("could not find the table") ||
      normalized.includes("schema cache")
    );

  if (mentionsUserIdentitiesSchemaGap) {
    return {
      status: 503,
      reason: "Identity storage schema is not ready. Run scripts/supabase-zklogin-auth-migration.sql.",
    };
  }

  if (mentionsAuthAuditSchemaGap) {
    return {
      status: 503,
      reason: "Auth audit schema is not ready. Run scripts/supabase-zklogin-auth-migration.sql.",
    };
  }

  return {
    status: 500,
    reason: raw || "Unable to persist zkLogin verification result",
  };
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
    mode: "service",
    identity,
    verifier: {
      contractVersion: "v1",
      failClosed: true,
      requiredFields: ["proof.bytes", "proof.signature"],
      optionalFields: ["proof.idToken", "proof.address", "proof.maxEpoch", "proof.userSignature", "proof.proofInputs", "expectedAddress", "requestId"],
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
        { status: toHttpStatus(verifyResult.code) }
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
      mode: "service",
      verified: true,
      linked: true,
      zkloginAddress: identity.zkloginAddress,
      verifierId: verifyResult.verifierId,
    });
  } catch (error) {
    const classified = classifyVerifyPersistenceError(error);
    await auditSafely({
      userId,
      authProvider: "zklogin",
      event: "zklogin_verify_route_exception",
      details: {
        reason: error instanceof Error ? error.message : String(error ?? "unknown"),
      },
    });

    return NextResponse.json(
      {
        ok: false,
        code: "VERIFIER_ERROR",
        reason: classified.reason,
      },
      { status: classified.status }
    );
  }
}
