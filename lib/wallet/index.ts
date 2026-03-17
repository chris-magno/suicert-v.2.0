// lib/wallet/index.ts
// Role detection — queries Sui RPC to check what Cap objects the wallet owns
import { normalizeSuiAddress } from "./address";

export type WalletRole = "admin" | "issuer" | "user";

export interface WalletSession {
  address: string;
  role: WalletRole;
  issuerCapId?: string;
  adminCapId?: string;
  issuerCapActive?: boolean;
}

const NETWORK_URLS: Record<string, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet:  "https://fullnode.devnet.sui.io:443",
};

export async function detectWalletRole(address: string): Promise<WalletSession> {
  const normalizedAddress = normalizeSuiAddress(address) ?? address;
  const packageId = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID;
  if (!packageId) return { address: normalizedAddress, role: "user" };

  const network = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";
  const rpcUrl  = NETWORK_URLS[network] ?? NETWORK_URLS.testnet;

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getOwnedObjects",
        params: [
          normalizedAddress,
          { filter: { Package: packageId }, options: { showType: true, showContent: true } },
          null,
          50,
        ],
      }),
    });

    const json = await res.json();
    const objects: Array<{ data?: { objectId?: string; type?: string; content?: Record<string, unknown> } }> =
      json?.result?.data ?? [];

    // AdminCap — highest privilege
    const adminCapObj = objects.find((o) =>
      (o.data?.type ?? "").includes("::soulbound::AdminCap")
    );
    if (adminCapObj?.data?.objectId) {
      return { address: normalizedAddress, role: "admin", adminCapId: adminCapObj.data.objectId };
    }

    // IssuerCap
    const issuerCapObj = objects.find((o) =>
      (o.data?.type ?? "").includes("::soulbound::IssuerCap")
    );
    if (issuerCapObj?.data?.objectId) {
      const fields = (issuerCapObj.data.content as Record<string, Record<string, unknown>>)?.fields ?? {};
      return {
        address: normalizedAddress,
        role: "issuer",
        issuerCapId: issuerCapObj.data.objectId,
        issuerCapActive: fields.active === true,
      };
    }

    return { address: normalizedAddress, role: "user" };
  } catch (err) {
    console.error("[detectWalletRole]", err);
    return { address: normalizedAddress, role: "user" };
  }
}
