// app/api/wallet/session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPersonalMessageSignature, verifySignature } from "@mysten/sui/verify";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { consumeWalletChallenge } from "@/lib/wallet/challenge-store";
import { detectWalletRole } from "@/lib/wallet";
import { getVerifiedWalletSession } from "@/lib/wallet/server-auth";
import { consumeRateLimit, getClientIdentifier } from "@/lib/security/rate-limit";
import { normalizeSuiAddress, sameSuiAddress } from "@/lib/wallet/address";

const SessionRequestSchema = z.object({
  address: z.string().transform((value, ctx) => {
    const normalized = normalizeSuiAddress(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "address must be a valid Sui address" });
      return z.NEVER;
    }
    return normalized;
  }),
  nonce: z.string().min(8),
  signature: z.string().min(20),
  signedBytes: z.string().min(1).optional(),
});

const SESSION_TTL_SECONDS = 60 * 60 * 12;
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

function authDebug(event: string, meta: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[wallet-auth]", event, meta);
  }
}

function fail(
  error: string,
  code: string,
  status: number,
  headers?: Record<string, string>
) {
  return NextResponse.json({ error, code }, { status, headers });
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    return Buffer.from(value, "base64");
  } catch {
    return null;
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function verifyWalletMessageSignature(message: Uint8Array, signature: string, address: string): Promise<{ ok: boolean; signerAddress?: string }> {
  const client = getSuiClient();

  try {
    const publicKey = await verifyPersonalMessageSignature(message, signature, { client });
    const signerAddress = publicKey.toSuiAddress();
    if (sameSuiAddress(signerAddress, address)) {
      return { ok: true, signerAddress };
    }
    return { ok: false, signerAddress };
  } catch {
    try {
      // Compatibility fallback for wallets using legacy signMessage.
      const publicKey = await verifySignature(message, signature);
      const signerAddress = publicKey.toSuiAddress();
      if (sameSuiAddress(signerAddress, address)) {
        return { ok: true, signerAddress };
      }
      return { ok: false, signerAddress };
    } catch {
      return { ok: false };
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const client = getClientIdentifier(req);
    const rawLimiter = consumeRateLimit({
      key: `wallet:session:raw:${client}`,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rawLimiter.allowed) {
      authDebug("rate_limited_raw", { client });
      return fail("Too many session attempts. Please retry shortly.", "RATE_LIMIT_RAW", 429, {
        "Retry-After": String(rawLimiter.retryAfterSeconds),
        "X-RateLimit-Remaining": String(rawLimiter.remaining),
      });
    }

    const body = await req.json();
    const parsed = SessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      authDebug("validation_failed", { details: parsed.error.flatten() });
      return NextResponse.json({ error: "Validation failed", code: "VALIDATION_FAILED", details: parsed.error.flatten() }, { status: 400 });
    }

    const address = parsed.data.address;
    const scopedLimiter = consumeRateLimit({
      key: `wallet:session:${client}:${address}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!scopedLimiter.allowed) {
      authDebug("rate_limited_scoped", { client, address });
      return fail("Too many session attempts for this wallet. Please retry shortly.", "RATE_LIMIT_SCOPED", 429, {
        "Retry-After": String(scopedLimiter.retryAfterSeconds),
        "X-RateLimit-Remaining": String(scopedLimiter.remaining),
      });
    }

    const challenge = consumeWalletChallenge(address, parsed.data.nonce);
    if (!challenge) {
      authDebug("challenge_invalid_or_expired", { address });
      return fail("Challenge invalid or expired", "CHALLENGE_INVALID_OR_EXPIRED", 401);
    }

    const expectedMessageBytes = new TextEncoder().encode(challenge.message);
    if (parsed.data.signedBytes) {
      const suppliedBytes = decodeBase64(parsed.data.signedBytes);
      if (!suppliedBytes || !bytesEqual(suppliedBytes, expectedMessageBytes)) {
        authDebug("signed_bytes_mismatch", { address });
        return fail("Signed message does not match challenge", "SIGNED_BYTES_MISMATCH", 401);
      }
    }

    const signatureResult = await verifyWalletMessageSignature(expectedMessageBytes, parsed.data.signature, address);
    if (!signatureResult.ok) {
      authDebug("signature_invalid", { address, signerAddress: signatureResult.signerAddress });
      return fail("Invalid wallet signature", "INVALID_SIGNATURE", 401);
    }

    const walletSession = await detectWalletRole(address);
    const verifiedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

    const sessionData = JSON.stringify({
      address,
      role: walletSession.role,
      issuerCapId: walletSession.issuerCapId,
      adminCapId: walletSession.adminCapId,
      issuerCapActive: walletSession.issuerCapActive,
      nonce: challenge.nonce,
      message: challenge.message,
      signature: parsed.data.signature,
      verifiedAt,
      expiresAt,
    });

    const res = NextResponse.json({
      success: true,
      session: {
        address,
        role: walletSession.role,
        issuerCapId: walletSession.issuerCapId,
        adminCapId: walletSession.adminCapId,
        issuerCapActive: walletSession.issuerCapActive,
        verifiedAt,
        expiresAt,
      },
    });
    res.cookies.set("suicert_wallet_session", sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch {
    authDebug("invalid_body");
    return fail("Invalid body", "INVALID_BODY", 400);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  // Explicitly expire cookie with matching attributes to avoid stale sessions.
  res.cookies.set("suicert_wallet_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}

export async function GET(req: NextRequest) {
  const verified = await getVerifiedWalletSession(req);
  return NextResponse.json({ session: verified });
}
