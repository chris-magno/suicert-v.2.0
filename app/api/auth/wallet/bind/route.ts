import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { bindWalletToUserIdentity, createAuthAuditLog, getUserIdentityByUserId } from "@/lib/supabase";
import { getVerifiedWalletSession } from "@/lib/wallet/server-auth";

export async function GET() {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string } | undefined;

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const identity = await getUserIdentityByUserId(user.id).catch(() => null);
  return NextResponse.json({
    ok: true,
    walletBoundAddress: identity?.walletBoundAddress ?? null,
    lastWalletVerifiedAt: identity?.lastWalletVerifiedAt ?? null,
    authProvider: identity?.authProvider ?? "google",
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string } | undefined;

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const verifiedWallet = await getVerifiedWalletSession(req);
  if (!verifiedWallet?.address) {
    await createAuthAuditLog({
      userId: user.id,
      authProvider: "wallet",
      event: "wallet_bind_rejected_no_verified_session",
    }).catch(() => {});

    return NextResponse.json(
      { error: "Verified wallet session required before binding." },
      { status: 401 }
    );
  }

  try {
    const identity = await bindWalletToUserIdentity({
      userId: user.id,
      walletAddress: verifiedWallet.address,
      verifiedAt: new Date().toISOString(),
    });

    await createAuthAuditLog({
      userId: user.id,
      authProvider: "wallet",
      walletAddress: verifiedWallet.address,
      event: "wallet_bind_succeeded",
      details: { role: verifiedWallet.role },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      walletBoundAddress: identity.walletBoundAddress,
      lastWalletVerifiedAt: identity.lastWalletVerifiedAt,
      authProvider: identity.authProvider,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wallet bind failed";

    await createAuthAuditLog({
      userId: user.id,
      authProvider: "wallet",
      walletAddress: verifiedWallet.address,
      event: "wallet_bind_failed",
      details: { message },
    }).catch(() => {});

    if (/user_identities|auth_audit_logs|relation/i.test(message)) {
      return NextResponse.json(
        {
          error: "Wallet identity tables are not ready. Run scripts/supabase-zklogin-auth-migration.sql first.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Wallet bind failed" }, { status: 500 });
  }
}
