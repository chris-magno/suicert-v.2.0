import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { createAuthAuditLog, getUserIdentityByUserId, getUserIdentityByWalletBoundAddress, upsertUserIdentity } from "@/lib/supabase";
import { normalizeSuiAddress } from "@/lib/wallet/address";

const BindWalletSchema = z.object({
  walletAddress: z.string().optional(),
  skip: z.boolean().optional(),
});

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
    walletBoundZkAddress: identity?.walletBoundZkAddress ?? null,
    walletBoundAt: identity?.walletBoundAt ?? null,
    walletSignatureVerified: identity?.walletSignatureVerified ?? false,
    walletVerifiedAt: identity?.walletVerifiedAt ?? null,
    walletBindingSkippedAt: identity?.walletBindingSkippedAt ?? null,
    authProvider: identity?.authProvider ?? "google",
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { id?: string; email?: string } | undefined;

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = BindWalletSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const currentIdentity = await getUserIdentityByUserId(user.id).catch(() => null);
  if (!currentIdentity?.zkloginAddress) {
    await createAuthAuditLog({
      userId: user.id,
      authProvider: "wallet",
      walletAddress: undefined,
      event: "wallet_bind_rejected_missing_zklogin_identity",
    }).catch(() => {});

    return NextResponse.json(
      {
        error: "zkLogin identity must be verified before wallet binding.",
        code: "ZKLOGIN_REQUIRED",
      },
      { status: 403 }
    );
  }

  if (parsed.data.skip) {
    const identity = await upsertUserIdentity({
      userId: user.id,
      authProvider: currentIdentity.authProvider,
      walletBindingSkippedAt: new Date().toISOString(),
    });

    await createAuthAuditLog({
      userId: user.id,
      authProvider: "wallet",
      event: "wallet_bind_skipped",
    }).catch(() => {});

    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        walletBindingSkippedAt: identity.walletBindingSkippedAt ?? null,
      },
      { status: 200 }
    );
  }

  const normalizedWallet = normalizeSuiAddress(parsed.data.walletAddress ?? "");
  if (!normalizedWallet) {
    return NextResponse.json({ error: "walletAddress is required and must be a valid Sui address" }, { status: 400 });
  }

  const walletOwner = await getUserIdentityByWalletBoundAddress(normalizedWallet).catch(() => null);
  if (walletOwner?.userId && walletOwner.userId !== user.id) {
    await createAuthAuditLog({
      userId: user.id,
      authProvider: "wallet",
      walletAddress: normalizedWallet,
      event: "wallet_bind_rejected_wallet_owned_by_other_user",
      details: {
        ownerUserId: walletOwner.userId,
      },
    }).catch(() => {});

    return NextResponse.json(
      {
        error: "This wallet is already bound to another account.",
        code: "WALLET_ALREADY_BOUND",
      },
      { status: 409 }
    );
  }

  try {
    const identity = await upsertUserIdentity({
      userId: user.id,
      authProvider: currentIdentity.authProvider,
      zkloginAddress: currentIdentity.zkloginAddress,
      zkMaxEpoch: currentIdentity.zkMaxEpoch,
      walletBoundAddress: normalizedWallet,
      walletBoundZkAddress: currentIdentity.zkloginAddress,
      walletBoundAt: new Date().toISOString(),
      walletSignatureVerified: false,
      walletSignature: undefined,
      walletVerifiedAt: undefined,
      walletBindingSkippedAt: undefined,
    });

    await createAuthAuditLog({
      userId: user.id,
      authProvider: "wallet",
      walletAddress: normalizedWallet,
      event: "wallet_bind_succeeded",
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      walletBoundAddress: identity.walletBoundAddress,
      walletBoundZkAddress: identity.walletBoundZkAddress,
      walletBoundAt: identity.walletBoundAt,
      walletSignatureVerified: identity.walletSignatureVerified ?? false,
      authProvider: identity.authProvider,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wallet bind failed";

    await createAuthAuditLog({
      userId: user.id,
      authProvider: "wallet",
      walletAddress: normalizedWallet,
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
