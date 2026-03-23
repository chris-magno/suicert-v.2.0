import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPersonalMessageSignature, verifySignature } from "@mysten/sui/verify";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { auth } from "@/lib/auth";
import { createAuthAuditLog, getUserIdentityByUserId, upsertUserIdentity } from "@/lib/supabase";
import { normalizeSuiAddress, sameSuiAddress } from "@/lib/wallet/address";

const VerifySignatureSchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(20),
  walletAddress: z.string().min(1),
  zkAddress: z.string().min(1),
});

const NETWORK_URLS: Record<string, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

let _suiClient: SuiJsonRpcClient | null = null;

function getSuiClient(): SuiJsonRpcClient {
  if (!_suiClient) {
    const network = ((process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet").toLowerCase() as "mainnet" | "testnet" | "devnet");
    const url = NETWORK_URLS[network] ?? NETWORK_URLS.testnet;
    _suiClient = new SuiJsonRpcClient({ url, network });
  }
  return _suiClient;
}

function parseTimestampFromMessage(message: string): string | null {
  const match = message.match(/Timestamp:\s*(.+)$/m);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function isCanonicalMessage(message: string, zkAddress: string, walletAddress: string): boolean {
  return message.includes("SUICERT Wallet Bind Verification")
    && message.includes(`ZK Address: ${zkAddress}`)
    && message.includes(`Wallet Address: ${walletAddress}`)
    && message.includes("Timestamp:");
}

async function recoverSignerAddress(message: Uint8Array, signature: string): Promise<string | null> {
  const client = getSuiClient();

  try {
    const publicKey = await verifyPersonalMessageSignature(message, signature, { client });
    return publicKey.toSuiAddress();
  } catch {
    try {
      const publicKey = await verifySignature(message, signature);
      return publicKey.toSuiAddress();
    } catch {
      return null;
    }
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = VerifySignatureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const identity = await getUserIdentityByUserId(user.id).catch(() => null);
  if (!identity?.zkloginAddress) {
    return NextResponse.json({ error: "zkLogin identity missing", code: "ZKLOGIN_REQUIRED" }, { status: 403 });
  }

  const walletAddress = normalizeSuiAddress(parsed.data.walletAddress);
  const zkAddress = normalizeSuiAddress(parsed.data.zkAddress);
  if (!walletAddress || !zkAddress) {
    return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
  }

  if (!sameSuiAddress(identity.zkloginAddress, zkAddress)) {
    return NextResponse.json({ error: "zkAddress does not match your verified identity", code: "ZK_ADDRESS_MISMATCH" }, { status: 403 });
  }

  if (!identity.walletBoundAddress || !sameSuiAddress(identity.walletBoundAddress, walletAddress)) {
    return NextResponse.json({ error: "walletAddress does not match your bound wallet", code: "WALLET_BIND_MISMATCH" }, { status: 403 });
  }

  if (!isCanonicalMessage(parsed.data.message, zkAddress, walletAddress)) {
    return NextResponse.json({ error: "Invalid canonical message format", code: "INVALID_CANONICAL_MESSAGE" }, { status: 400 });
  }

  const timestampIso = parseTimestampFromMessage(parsed.data.message);
  if (!timestampIso) {
    return NextResponse.json({ error: "Missing message timestamp", code: "TIMESTAMP_REQUIRED" }, { status: 400 });
  }

  const timestampMs = new Date(timestampIso).getTime();
  if (!Number.isFinite(timestampMs)) {
    return NextResponse.json({ error: "Invalid message timestamp", code: "TIMESTAMP_INVALID" }, { status: 400 });
  }

  const ageMs = Date.now() - timestampMs;
  if (ageMs < 0 || ageMs > 5 * 60 * 1000) {
    return NextResponse.json({ error: "Signature message expired. Please sign again.", code: "TIMESTAMP_EXPIRED" }, { status: 401 });
  }

  const recoveredAddress = await recoverSignerAddress(new TextEncoder().encode(parsed.data.message), parsed.data.signature);
  if (!recoveredAddress || !sameSuiAddress(recoveredAddress, walletAddress)) {
    await createAuthAuditLog({
      userId: user.id,
      authProvider: "wallet",
      walletAddress,
      event: "wallet_signature_verify_failed",
      details: {
        recoveredAddress,
        expectedAddress: walletAddress,
      },
    }).catch(() => {});

    return NextResponse.json({ error: "Signature verification failed", code: "SIGNATURE_INVALID" }, { status: 401 });
  }

  const verifiedAt = new Date().toISOString();
  const updated = await upsertUserIdentity({
    userId: user.id,
    authProvider: identity.authProvider,
    zkloginAddress: identity.zkloginAddress,
    zkMaxEpoch: identity.zkMaxEpoch,
    walletBoundAddress: identity.walletBoundAddress,
    walletBoundZkAddress: identity.walletBoundZkAddress ?? identity.zkloginAddress,
    walletBoundAt: identity.walletBoundAt,
    walletSignatureVerified: true,
    walletSignature: parsed.data.signature,
    walletVerifiedAt: verifiedAt,
    walletBindingSkippedAt: undefined,
    lastWalletVerifiedAt: verifiedAt,
  });

  await createAuthAuditLog({
    userId: user.id,
    authProvider: "wallet",
    walletAddress,
    event: "wallet_signature_verified",
    details: {
      zkAddress,
      verifiedAt,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    walletSignatureVerified: updated.walletSignatureVerified ?? false,
    walletVerifiedAt: updated.walletVerifiedAt ?? verifiedAt,
  });
}
