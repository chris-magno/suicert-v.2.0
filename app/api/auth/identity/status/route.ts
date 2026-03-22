import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserIdentityByUserId } from "@/lib/supabase";
import { getVerifiedWalletSession } from "@/lib/wallet/server-auth";
import { sameSuiAddress } from "@/lib/wallet/address";

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

  const zkAddress = identity?.zkloginAddress ?? null;
  const walletAddress = walletSession?.address ?? null;
  const l1ZkIdentity = Boolean(zkAddress);
  const l2WalletMatch = Boolean(zkAddress && walletAddress && sameSuiAddress(zkAddress, walletAddress));
  const l3SignatureFresh = Boolean(
    l2WalletMatch &&
    typeof ageSeconds === "number" &&
    ageSeconds >= 0 &&
    ageSeconds <= maxAgeSeconds
  );

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
      zkloginAddress: zkAddress,
      walletBoundAddress: identity?.walletBoundAddress ?? null,
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
      l2WalletMatch,
      l3SignatureFresh,
      l4CanExecuteWrite: l1ZkIdentity && l2WalletMatch && l3SignatureFresh,
    },
    policy: {
      walletActionMaxAgeSeconds: maxAgeSeconds,
    },
  });
}
