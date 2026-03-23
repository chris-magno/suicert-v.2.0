import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { decodeJwt, generateNonce } from "@mysten/sui/zklogin";
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import {
  createAuthAuditLog,
  getUserIdentityByUserId,
  getUserIdentityByZkloginAddress,
  upsertUserIdentity,
} from "@/lib/supabase";
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
  binding: z
    .object({
      nonce: z.string().min(1),
      jwtRandomness: z.string().regex(/^\d+$/),
      maxEpoch: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]),
      ephemeralPublicKeyRaw: z.string().min(1),
    })
    .strict(),
  expectedAddress: z.string().optional(),
  requestId: z.string().optional(),
});

const JWT_CLAIMS_SCHEMA = z
  .object({
    iss: z.string().min(1),
    aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    nonce: z.string().min(1),
    exp: z.number().int().optional(),
    iat: z.number().int().optional(),
  })
  .passthrough();

const TRUSTED_GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

function resolveAllowedGoogleAudiences(): string[] {
  const values = [
    process.env.NEXT_PUBLIC_ZKLOGIN_GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_ID,
    process.env.AUTH_GOOGLE_ID,
  ]
    .flatMap((value) => (value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(values));
}

function parseEpoch(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10);
  return Number.NaN;
}

function toAudienceList(aud: string | string[]): string[] {
  return Array.isArray(aud) ? aud : [aud];
}

function validateJwtLifetime(claims: z.infer<typeof JWT_CLAIMS_SCHEMA>): string | null {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const allowedSkewSeconds = 120;

  if (typeof claims.exp === "number" && claims.exp + allowedSkewSeconds < nowSeconds) {
    return "id_token is expired";
  }

  if (typeof claims.iat === "number" && claims.iat - allowedSkewSeconds > nowSeconds) {
    return "id_token has invalid issued-at timestamp";
  }

  return null;
}

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

function isZkloginUniqueConflict(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();

  return normalized.includes("user_identities_zklogin_address_uniq")
    || (normalized.includes("duplicate") && normalized.includes("zklogin_address"));
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
      requiredFields: ["proof.bytes", "proof.signature", "proof.idToken", "binding.nonce", "binding.jwtRandomness", "binding.maxEpoch", "binding.ephemeralPublicKeyRaw"],
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

    if (!parsed.data.proof.idToken) {
      return NextResponse.json(
        { error: "idToken is required for zkLogin verification" },
        { status: 400 }
      );
    }

    let decodedJwtPayload: unknown;
    try {
      decodedJwtPayload = decodeJwt(parsed.data.proof.idToken);
    } catch {
      return NextResponse.json(
        { error: "Unable to decode idToken" },
        { status: 400 }
      );
    }

    const decodedClaimsResult = JWT_CLAIMS_SCHEMA.safeParse(decodedJwtPayload);
    if (!decodedClaimsResult.success) {
      return NextResponse.json(
        { error: "idToken payload is invalid", details: decodedClaimsResult.error.flatten() },
        { status: 400 }
      );
    }

    const decodedClaims = decodedClaimsResult.data;
    if (!TRUSTED_GOOGLE_ISSUERS.has(decodedClaims.iss)) {
      return NextResponse.json(
        { error: "Untrusted OAuth issuer in idToken" },
        { status: 401 }
      );
    }

    const audienceList = toAudienceList(decodedClaims.aud);
    const allowedAudiences = resolveAllowedGoogleAudiences();
    if (allowedAudiences.length > 0 && !audienceList.some((aud) => allowedAudiences.includes(aud))) {
      return NextResponse.json(
        { error: "idToken audience does not match configured Google client ID" },
        { status: 401 }
      );
    }

    const lifetimeReason = validateJwtLifetime(decodedClaims);
    if (lifetimeReason) {
      return NextResponse.json(
        { error: lifetimeReason },
        { status: 401 }
      );
    }

    const bindingMaxEpoch = parseEpoch(parsed.data.binding.maxEpoch);
    const proofMaxEpoch = parseEpoch(parsed.data.proof.maxEpoch);
    if (!Number.isFinite(bindingMaxEpoch)) {
      return NextResponse.json(
        { error: "Invalid binding.maxEpoch" },
        { status: 400 }
      );
    }

    if (Number.isFinite(proofMaxEpoch) && proofMaxEpoch !== bindingMaxEpoch) {
      return NextResponse.json(
        { error: "proof.maxEpoch does not match binding.maxEpoch" },
        { status: 400 }
      );
    }

    let computedNonce: string;
    try {
      const ephemeralPublicKey = new Ed25519PublicKey(parsed.data.binding.ephemeralPublicKeyRaw);
      computedNonce = generateNonce(ephemeralPublicKey, bindingMaxEpoch, parsed.data.binding.jwtRandomness);
    } catch {
      return NextResponse.json(
        { error: "Invalid ephemeralPublicKeyRaw for nonce binding" },
        { status: 400 }
      );
    }

    if (parsed.data.binding.nonce !== computedNonce || decodedClaims.nonce !== computedNonce) {
      await auditSafely({
        userId,
        authProvider: "zklogin",
        event: "zklogin_verify_nonce_binding_failed",
        details: {
          requestId: parsed.data.requestId,
          tokenNonce: decodedClaims.nonce,
          providedNonce: parsed.data.binding.nonce,
          computedNonce,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_PROOF",
          reason: "JWT nonce does not match ephemeral key binding",
        },
        { status: 401 }
      );
    }

    await auditSafely({
      userId,
      authProvider: "zklogin",
      walletAddress: normalizedExpected ?? parsed.data.proof.address,
      event: "zklogin_verify_requested",
      details: {
        requestId: parsed.data.requestId,
        hasAddressHint: Boolean(parsed.data.proof.address),
        hasProofInputs: Boolean(parsed.data.proof.proofInputs),
          issuer: decodedClaims.iss,
          audience: audienceList,
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

    let identity;
    try {
      const maxEpochRaw = parsed.data.proof.maxEpoch;
      const parsedMaxEpoch = typeof maxEpochRaw === "number"
        ? maxEpochRaw
        : typeof maxEpochRaw === "string"
          ? Number.parseInt(maxEpochRaw, 10)
          : bindingMaxEpoch;

      identity = await upsertUserIdentity({
        userId,
        authProvider: "zklogin",
        zkloginAddress: verifiedAddress,
        zkMaxEpoch: Number.isFinite(parsedMaxEpoch) ? parsedMaxEpoch : undefined,
      });
    } catch (error) {
      if (!isZkloginUniqueConflict(error)) throw error;

      const existingOwner = await getUserIdentityByZkloginAddress(verifiedAddress).catch(() => null);
      if (!existingOwner?.userId || existingOwner.userId === userId) {
        throw error;
      }

      await auditSafely({
        userId,
        authProvider: "zklogin",
        walletAddress: verifiedAddress,
        event: "zklogin_verify_rejected_existing_owner",
        details: {
          requestId: parsed.data.requestId,
          ownerUserId: existingOwner.userId,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          code: "ZKLOGIN_ALREADY_LINKED",
          reason: "This zkLogin identity is already linked to another account.",
        },
        { status: 409 }
      );
    }

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
