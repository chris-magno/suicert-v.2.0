import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIssuerByEmail, getIssuerByWallet, getUserIdentityByUserId } from "@/lib/supabase";
import { sameSuiAddress } from "@/lib/wallet/address";
import { getVerifiedWalletSession } from "@/lib/wallet/server-auth";

function toAgeSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / 1000);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string } | undefined;

  if (!user?.id) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }

  const identity = await getUserIdentityByUserId(user.id).catch(() => null);
  const walletSession = await getVerifiedWalletSession(req);
  const maxAgeSeconds = Number.parseInt(process.env.WALLET_ACTION_MAX_AGE_SECONDS ?? "300", 10);
  const signatureAgeSeconds = toAgeSeconds(walletSession?.verifiedAt);

  const l1ZkIdentity = Boolean(identity?.zkloginAddress);
  const l2WalletMatch = Boolean(
    l1ZkIdentity &&
    walletSession?.address &&
    sameSuiAddress(walletSession.address, identity?.zkloginAddress)
  );
  const l3SignatureFresh = Boolean(
    l2WalletMatch &&
    typeof signatureAgeSeconds === "number" &&
    signatureAgeSeconds >= 0 &&
    signatureAgeSeconds <= (Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0 ? maxAgeSeconds : 300)
  );

  const issuerByWallet = identity?.zkloginAddress
    ? await getIssuerByWallet(identity.zkloginAddress).catch(() => null)
    : null;
  const issuerByEmail = user.email
    ? await getIssuerByEmail(user.email).catch(() => null)
    : null;
  const existingProfile = issuerByWallet ?? issuerByEmail;

  return NextResponse.json({
    ok: true,
    authenticated: true,
    identity: {
      zkloginAddress: identity?.zkloginAddress ?? null,
      walletBoundAddress: identity?.walletBoundAddress ?? null,
    },
    walletSession: walletSession ? {
      address: walletSession.address,
      verifiedAt: walletSession.verifiedAt,
      expiresAt: walletSession.expiresAt,
      ageSeconds: signatureAgeSeconds,
    } : null,
    gates: {
      l1ZkIdentity,
      l2WalletMatch,
      l3SignatureFresh,
    },
    registration: {
      state: existingProfile ? "returning" : "new",
      hasProfile: Boolean(existingProfile),
      issuerStatus: existingProfile?.status ?? null,
      nextRoute: existingProfile ? "/dashboard" : "/issuer?tab=apply",
    },
  });
}
