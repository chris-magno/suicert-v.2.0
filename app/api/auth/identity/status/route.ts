import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserIdentityByUserId } from "@/lib/supabase";
import { getVerifiedWalletSession } from "@/lib/wallet/server-auth";
import { resolveCurrentStep } from "@/lib/auth/resolve-current-step";

function parseActionMaxAgeSeconds(): number {
  const value = Number.parseInt(process.env.WALLET_ACTION_MAX_AGE_SECONDS ?? "300", 10);
  return Number.isFinite(value) && value > 0 ? value : 300;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string; name?: string; image?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({
      ok: false,
      authenticated: false,
      gates: {
        l1ZkIdentity: false,
        l2WalletMatch: false,
        l3SignatureFresh: false,
      },
    }, { status: 401 });
  }

  const identity = await getUserIdentityByUserId(user.id).catch(() => null);
  const walletSession = await getVerifiedWalletSession(req);
  const maxAgeSeconds = parseActionMaxAgeSeconds();
  const verifiedAtMs = walletSession?.verifiedAt ? new Date(walletSession.verifiedAt).getTime() : Number.NaN;
  const ageSeconds = Number.isFinite(verifiedAtMs) ? Math.floor((Date.now() - verifiedAtMs) / 1000) : null;
  const stepState = await resolveCurrentStep(user.id).catch(() => ({
    step: "layer2_zklogin" as const,
    currentEpoch: null,
    zkMaxEpoch: null,
    zkEpochValid: false,
    canSkipWallet: true,
  }));

  const l1ZkIdentity = Boolean(identity?.zkloginAddress && stepState.zkEpochValid);
  const hasWallet = Boolean(identity?.walletBoundAddress);
  const skippedWallet = Boolean(identity?.walletBindingSkippedAt);
  const walletVerified = Boolean(identity?.walletSignatureVerified);
  const l2WalletBound = Boolean(hasWallet || skippedWallet);
  const l3SignatureFresh = Boolean(skippedWallet || (hasWallet && walletVerified));

  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      image: user.image ?? null,
    },
    identity: {
      authProvider: identity?.authProvider ?? "google",
      zkloginAddress: identity?.zkloginAddress ?? null,
      zkMaxEpoch: identity?.zkMaxEpoch ?? null,
      walletBoundAddress: identity?.walletBoundAddress ?? null,
      walletBoundZkAddress: identity?.walletBoundZkAddress ?? null,
      walletBoundAt: identity?.walletBoundAt ?? null,
      walletSignatureVerified: identity?.walletSignatureVerified ?? false,
      walletVerifiedAt: identity?.walletVerifiedAt ?? null,
      walletBindingSkippedAt: identity?.walletBindingSkippedAt ?? null,
      lastWalletVerifiedAt: identity?.lastWalletVerifiedAt ?? null,
    },
    walletSession: walletSession ? {
      address: walletSession.address,
      role: walletSession.role,
      verifiedAt: walletSession.verifiedAt,
      expiresAt: walletSession.expiresAt,
      ageSeconds,
    } : null,
    gates: {
      l1ZkIdentity,
      l2WalletMatch: l2WalletBound,
      l3SignatureFresh,
      l4CanExecuteWrite: l1ZkIdentity && l2WalletBound && l3SignatureFresh,
    },
    flow: {
      currentStep: stepState.step,
      currentEpoch: stepState.currentEpoch,
      zkMaxEpoch: stepState.zkMaxEpoch,
      zkEpochValid: stepState.zkEpochValid,
      canSkipWallet: stepState.canSkipWallet,
      done: stepState.step === "done",
    },
    policy: {
      walletActionMaxAgeSeconds: maxAgeSeconds,
    },
  });
}
