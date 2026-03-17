import { NextRequest } from "next/server";
import { verifyPersonalMessageSignature, verifySignature } from "@mysten/sui/verify";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { detectWalletRole, type WalletRole, type WalletSession } from "@/lib/wallet";
import { isNormalizedSuiAddress, normalizeSuiAddress, sameSuiAddress } from "@/lib/wallet/address";

interface WalletCookiePayload {
  address: string;
  nonce: string;
  message: string;
  signature: string;
  verifiedAt: string;
  expiresAt: string;
}

export interface VerifiedWalletSession extends WalletSession {
  verifiedAt: string;
  expiresAt: string;
}

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

async function verifyWalletMessageSignature(message: Uint8Array, signature: string, address: string): Promise<boolean> {
  const client = getSuiClient();

  try {
    const publicKey = await verifyPersonalMessageSignature(message, signature, { client });
    return sameSuiAddress(publicKey.toSuiAddress(), address);
  } catch {
    try {
      // Compatibility fallback for sessions created with legacy signMessage wallets.
      const publicKey = await verifySignature(message, signature);
      return sameSuiAddress(publicKey.toSuiAddress(), address);
    } catch {
      return false;
    }
  }
}

function parseWalletCookiePayload(req: NextRequest): WalletCookiePayload | null {
  const raw = req.cookies.get("suicert_wallet_session")?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<WalletCookiePayload>;
    if (!parsed.address || !parsed.nonce || !parsed.message || !parsed.signature || !parsed.expiresAt || !parsed.verifiedAt) {
      return null;
    }

    const normalizedAddress = normalizeSuiAddress(parsed.address);
    if (!normalizedAddress) return null;

    return {
      address: normalizedAddress,
      nonce: parsed.nonce,
      message: parsed.message,
      signature: parsed.signature,
      verifiedAt: parsed.verifiedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function getVerifiedWalletSession(req: NextRequest): Promise<VerifiedWalletSession | null> {
  const payload = parseWalletCookiePayload(req);
  if (!payload) return null;

  if (!isNormalizedSuiAddress(payload.address)) return null;
  const expiresAtMs = new Date(payload.expiresAt).getTime();
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) return null;

  const encoded = new TextEncoder().encode(payload.message);
  const signatureOk = await verifyWalletMessageSignature(encoded, payload.signature, payload.address);
  if (!signatureOk) {
    return null;
  }

  if (!payload.message.includes(`Address: ${payload.address}`)) return null;
  if (!payload.message.includes(`Nonce: ${payload.nonce}`)) return null;
  if (!payload.message.includes("SUICERT Wallet Authentication")) return null;

  let onChainSession: WalletSession;
  try {
    onChainSession = await detectWalletRole(payload.address);
  } catch {
    return null;
  }

  return {
    address: onChainSession.address,
    role: onChainSession.role as WalletRole,
    issuerCapId: onChainSession.issuerCapId,
    adminCapId: onChainSession.adminCapId,
    issuerCapActive: onChainSession.issuerCapActive,
    verifiedAt: payload.verifiedAt,
    expiresAt: payload.expiresAt,
  };
}

export async function isAdminWalletSession(req: NextRequest): Promise<boolean> {
  const session = await getVerifiedWalletSession(req);
  return session?.role === "admin";
}
