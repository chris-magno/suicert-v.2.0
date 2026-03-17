import { randomUUID } from "crypto";
import { normalizeSuiAddress } from "@/lib/wallet/address";

interface WalletChallengeRecord {
  nonce: string;
  address: string;
  message: string;
  expiresAt: number;
  used: boolean;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 500;

const challengeStore = new Map<string, WalletChallengeRecord>();

function normalizeAddress(address: string): string {
  return normalizeSuiAddress(address) ?? address.trim().toLowerCase();
}

function cleanupExpiredChallenges(now: number) {
  for (const [nonce, record] of challengeStore.entries()) {
    if (record.expiresAt < now || record.used) {
      challengeStore.delete(nonce);
    }
  }

  if (challengeStore.size <= MAX_CHALLENGES) return;

  // Safety cap to avoid unbounded growth in long-lived dev sessions.
  const entries = [...challengeStore.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  for (let i = 0; i < entries.length - MAX_CHALLENGES; i += 1) {
    challengeStore.delete(entries[i][0]);
  }
}

export function createWalletChallenge(address: string): { nonce: string; message: string; expiresAt: string } {
  const now = Date.now();
  cleanupExpiredChallenges(now);

  const nonce = randomUUID().replace(/-/g, "");
  const issuedAtIso = new Date(now).toISOString();
  const expiresAtMs = now + CHALLENGE_TTL_MS;
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  const message = [
    "SUICERT Wallet Authentication",
    `Address: ${normalizeAddress(address)}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAtIso}`,
    `Expires At: ${expiresAtIso}`,
    "Action: Establish wallet session",
  ].join("\n");

  challengeStore.set(nonce, {
    nonce,
    address: normalizeAddress(address),
    message,
    expiresAt: expiresAtMs,
    used: false,
  });

  return { nonce, message, expiresAt: expiresAtIso };
}

export function consumeWalletChallenge(address: string, nonce: string): WalletChallengeRecord | null {
  const record = challengeStore.get(nonce);
  if (!record) return null;

  const now = Date.now();
  if (record.used || record.expiresAt < now) {
    challengeStore.delete(nonce);
    return null;
  }

  if (record.address !== normalizeAddress(address)) {
    return null;
  }

  record.used = true;
  challengeStore.set(nonce, record);
  return record;
}
