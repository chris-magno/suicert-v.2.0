import { createHash } from "crypto";

function deriveStableSaltFromUser(userId: string, pepper: string): string {
  const digestHex = createHash("sha256")
    .update(`suicert-zklogin-salt:${userId}:${pepper}`)
    .digest("hex")
    .slice(0, 32);

  return BigInt(`0x${digestHex}`).toString(10);
}

export function getDeterministicZkSalt(userId: string): string {
  const pepper = process.env.ZKLOGIN_SALT_PEPPER?.trim() ?? "";
  if (!pepper) {
    throw new Error("ZKLOGIN_SALT_PEPPER is required to derive deterministic zkLogin salts.");
  }

  return deriveStableSaltFromUser(userId, pepper);
}
