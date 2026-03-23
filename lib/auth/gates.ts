import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserIdentityByUserId } from "@/lib/supabase";
import { resolveCurrentStep } from "@/lib/auth/resolve-current-step";

export interface SuiCertGateContext {
  userId: string;
  userEmail?: string;
  zkloginAddress: string;
  walletAddress: string;
  walletRole: "admin" | "issuer" | "user";
  walletVerifiedAt: string;
  walletExpiresAt: string;
}

export interface SuiCertGateOptions {
  requireFreshSignature?: boolean;
  actionMaxAgeSeconds?: number;
}

export interface SuiCertGateResult {
  ok: true;
  context: SuiCertGateContext;
}

export interface SuiCertGateFailure {
  ok: false;
  response: NextResponse;
}

function fail(status: number, code: string, error: string, details?: Record<string, unknown>): SuiCertGateFailure {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, code, error, ...(details ? { details } : {}) }, { status }),
  };
}

export async function requireSuiCertWriteGates(
  _req: NextRequest,
  options: SuiCertGateOptions = {}
): Promise<SuiCertGateResult | SuiCertGateFailure> {
  const requireFreshSignature = options.requireFreshSignature ?? true;
  const configuredMaxAge = Number.parseInt(process.env.WALLET_ACTION_MAX_AGE_SECONDS ?? "300", 10);
  const actionMaxAgeSeconds = options.actionMaxAgeSeconds
    ?? (Number.isFinite(configuredMaxAge) && configuredMaxAge > 0 ? configuredMaxAge : 300);

  const session = await auth();
  const user = session?.user as { id?: string; email?: string } | undefined;
  if (!user?.id) {
    return fail(401, "GOOGLE_SESSION_REQUIRED", "Google session is required before zkLogin authorization.");
  }

  const identity = await getUserIdentityByUserId(user.id).catch(() => null);
  if (!identity?.zkloginAddress) {
    return fail(401, "ZKLOGIN_REQUIRED", "zkLogin identity verification is required.");
  }

  const step = await resolveCurrentStep(user.id).catch(() => ({
    step: "layer2_zklogin" as const,
  }));

  if (step.step === "layer2_zklogin") {
    return fail(401, "ZKLOGIN_REQUIRED", "zkLogin proof is missing or expired. Complete Layer 2 first.");
  }

  if (step.step === "layer3_wallet_bind") {
    return fail(401, "WALLET_BIND_REQUIRED", "Bind a wallet or explicitly skip wallet binding before continuing.");
  }

  if (requireFreshSignature && step.step === "layer4_signature_verify") {
    return fail(401, "WALLET_SIGNATURE_REQUIRED", "Wallet signature verification is required before write actions.");
  }

  const effectiveWalletAddress = identity.walletBoundAddress ?? identity.zkloginAddress;

  return {
    ok: true,
    context: {
      userId: user.id,
      userEmail: user.email,
      zkloginAddress: identity.zkloginAddress,
      walletAddress: effectiveWalletAddress,
      walletRole: "user",
      walletVerifiedAt: identity.walletVerifiedAt ?? identity.lastWalletVerifiedAt ?? new Date().toISOString(),
      walletExpiresAt: new Date(Date.now() + actionMaxAgeSeconds * 1000).toISOString(),
    },
  };
}
