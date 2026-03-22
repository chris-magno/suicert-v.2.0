import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserIdentityByUserId } from "@/lib/supabase";
import { sameSuiAddress } from "@/lib/wallet/address";
import { getVerifiedWalletSession } from "@/lib/wallet/server-auth";

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

function toUnixMs(isoString: string | undefined): number {
  if (!isoString) return Number.NaN;
  const ts = new Date(isoString).getTime();
  return Number.isFinite(ts) ? ts : Number.NaN;
}

function fail(status: number, code: string, error: string, details?: Record<string, unknown>): SuiCertGateFailure {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, code, error, ...(details ? { details } : {}) }, { status }),
  };
}

export async function requireSuiCertWriteGates(
  req: NextRequest,
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

  const walletSession = await getVerifiedWalletSession(req);
  if (!walletSession?.address) {
    return fail(401, "WALLET_AUTH_REQUIRED", "Wallet authorization is required. Sign the wallet challenge first.");
  }

  if (!sameSuiAddress(walletSession.address, identity.zkloginAddress)) {
    return fail(403, "WALLET_ZKLOGIN_MISMATCH", "Connected wallet does not match your zkLogin identity.", {
      zkloginAddress: identity.zkloginAddress,
      walletAddress: walletSession.address,
    });
  }

  if (requireFreshSignature) {
    const verifiedAtMs = toUnixMs(walletSession.verifiedAt);
    if (!Number.isFinite(verifiedAtMs)) {
      return fail(401, "SIGNATURE_MISSING_TIMESTAMP", "Wallet signature timestamp is missing. Please sign again.");
    }

    const ageSeconds = Math.floor((Date.now() - verifiedAtMs) / 1000);
    if (ageSeconds > actionMaxAgeSeconds) {
      return fail(401, "SIGNATURE_STALE", "Wallet signature is stale. Please re-authenticate your wallet before writing on-chain state.", {
        ageSeconds,
        maxAgeSeconds: actionMaxAgeSeconds,
      });
    }
  }

  return {
    ok: true,
    context: {
      userId: user.id,
      userEmail: user.email,
      zkloginAddress: identity.zkloginAddress,
      walletAddress: walletSession.address,
      walletRole: walletSession.role,
      walletVerifiedAt: walletSession.verifiedAt,
      walletExpiresAt: walletSession.expiresAt,
    },
  };
}
