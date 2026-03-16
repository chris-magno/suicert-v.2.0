// lib/sui/index.ts
// Sui blockchain integration — SBT minting, verification, zkLogin
// Toggle NEXT_PUBLIC_USE_MOCK_SUI=true in .env.local to use mocks during dev

import type { SuiMintResult, SuiVerifyResult } from "@/types";

export type { SuiMintResult, SuiVerifyResult };

const NETWORK_URLS: Record<string, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
};

export interface IssuerRegistrationProofVerification {
  ok: boolean;
  error?: string;
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function getRpcUrl(): string {
  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet").toLowerCase();
  return NETWORK_URLS[network] ?? NETWORK_URLS.testnet;
}

async function callSuiRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(getRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Sui RPC request failed: ${res.status}`);
  }

  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message ?? "Sui RPC error");
  }

  return json.result as T;
}

export function buildSuiTxExplorerUrl(txDigest: string): string {
  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet").toLowerCase();
  const explorerNetwork = network === "mainnet" ? "mainnet" : network === "devnet" ? "devnet" : "testnet";
  return `https://suiexplorer.com/txblock/${txDigest}?network=${explorerNetwork}`;
}

export async function verifyIssuerRegistrationProof(params: {
  txDigest: string;
  issuerCapId: string;
  expectedSender: string;
}): Promise<IssuerRegistrationProofVerification> {
  const expectedSender = normalizeAddress(params.expectedSender);

  try {
    const tx = await callSuiRpc<Record<string, unknown>>("sui_getTransactionBlock", [
      params.txDigest,
      { showInput: true, showEffects: true },
    ]);

    const status = ((tx.effects as Record<string, unknown> | undefined)?.status as Record<string, unknown> | undefined)?.status;
    if (status !== "success") {
      return { ok: false, error: "Transaction status is not successful" };
    }

    const sender = (((tx.transaction as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.sender as string | undefined)?.toLowerCase();
    if (!sender || sender !== expectedSender) {
      return { ok: false, error: "Transaction sender does not match wallet session address" };
    }

    const objectData = await callSuiRpc<Record<string, unknown>>("sui_getObject", [
      params.issuerCapId,
      { showOwner: true, showType: true },
    ]);

    const details = objectData.data as Record<string, unknown> | undefined;
    if (!details) {
      return { ok: false, error: "Issuer cap object not found on-chain" };
    }

    const owner = details.owner as Record<string, unknown> | undefined;
    const ownerAddress = ((owner?.AddressOwner as string | undefined) ?? (owner?.ObjectOwner as string | undefined) ?? "").toLowerCase();
    if (!ownerAddress || ownerAddress !== expectedSender) {
      return { ok: false, error: "Issuer cap is not owned by the connected wallet" };
    }

    const objectType = ((details.content as Record<string, unknown> | undefined)?.type as string | undefined) ?? (details.type as string | undefined) ?? "";
    if (!objectType.includes("::IssuerCap")) {
      return { ok: false, error: "Provided object is not an IssuerCap" };
    }

    const packageId = (process.env.NEXT_PUBLIC_SUI_PACKAGE_ID ?? "").toLowerCase();
    if (packageId && !objectType.toLowerCase().startsWith(`${packageId}::`)) {
      return { ok: false, error: "IssuerCap does not belong to configured package" };
    }

    return { ok: true };
  } catch (error) {
    console.error("[verifyIssuerRegistrationProof]", error);
    return { ok: false, error: "Failed to verify on-chain proof via Sui RPC" };
  }
}

// ── Production Mint (uncomment when SUI_ADMIN_PRIVATE_KEY is set) ─────────────
// import { Transaction } from "@mysten/sui/transactions";
// import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
// import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
//
// const client = new SuiClient({
//   url: process.env.SUI_NETWORK === "mainnet"
//     ? getFullnodeUrl("mainnet")
//     : getFullnodeUrl("devnet"),
// });
//
// export async function mintSoulboundToken(params: {
//   recipientAddress: string;
//   metadataUri: string;
//   eventRecordId: string;
//   issuerId: string;
//   recipientName: string;
//   aiSummary: string;
//   attendanceMinutes: number;
//   attendancePct: number;
// }): Promise<SuiMintResult> {
//   const keypair = Ed25519Keypair.fromSecretKey(
//     Buffer.from(process.env.SUI_ADMIN_PRIVATE_KEY!, "hex")
//   );
//   const tx = new Transaction();
//   tx.moveCall({
//     target: `${process.env.SUI_PACKAGE_ID}::soulbound::mint`,
//     arguments: [
//       tx.object(process.env.SUI_ADMIN_CAP_ID!),
//       tx.object(params.eventRecordId),
//       tx.object(process.env.SUI_GLOBAL_REGISTRY_ID!),
//       tx.object("0x6"), // Clock system object
//       tx.pure.address(params.recipientAddress),
//       tx.pure.vector("u8", [...Buffer.from(params.recipientName)]),
//       tx.pure.vector("u8", [...Buffer.from(params.issuerId)]),
//       tx.pure.vector("u8", [...Buffer.from(params.metadataUri)]),
//       tx.pure.vector("u8", [...Buffer.from(params.aiSummary)]),
//       tx.pure.u64(params.attendanceMinutes),
//       tx.pure.u8(params.attendancePct),
//     ],
//   });
//   const result = await client.signAndExecuteTransaction({
//     signer: keypair,
//     transaction: tx,
//     options: { showObjectChanges: true, showEvents: true },
//   });
//   const mintEvent = result.events?.find((e) => e.type.includes("CertMinted"));
//   const certId = (mintEvent?.parsedJson as any)?.cert_id ?? "";
//   return {
//     objectId: certId,
//     digest: result.digest,
//     explorerUrl: `https://suiexplorer.com/object/${certId}?network=${process.env.SUI_NETWORK ?? "mainnet"}`,
//   };
// }

// ── Mock Implementation ───────────────────────────────────────────────────────

function randomHex(len: number) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export async function mintSoulboundToken(_params: {
  recipientAddress: string;
  metadataUri: string;
  eventId: string;
  recipientName: string;
  issuerName: string;
}): Promise<SuiMintResult> {
  await new Promise((r) => setTimeout(r, 2000));
  const objectId = `0x${randomHex(64)}`;
  const digest = Array.from({ length: 44 }, () =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]
  ).join("");
  return {
    objectId,
    digest,
    explorerUrl: `https://suiexplorer.com/object/${objectId}?network=mainnet`,
  };
}

export async function verifySoulboundToken(objectId: string): Promise<SuiVerifyResult> {
  await new Promise((r) => setTimeout(r, 600));
  return {
    exists: true,
    objectId,
    owner: "soulbound",
    metadata: {
      name: "SUICERT Achievement",
      issuer: "Philippine Blockchain Institute",
      soulbound: "true",
    },
  };
}

export async function getZkLoginAddress(_googleJwt: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 300));
  const hash = Array.from(_googleJwt.slice(0, 32))
    .map((ch) => (ch as string).charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return `0x${hash.padEnd(64, "0")}`;
}

export async function getUSDTBalance(_address: string): Promise<number> {
  await new Promise((r) => setTimeout(r, 400));
  return 250.0;
}
