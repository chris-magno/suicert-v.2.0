const HEX_ADDRESS_REGEX = /^(0x)?[a-fA-F0-9]{1,64}$/;
const NORMALIZED_ADDRESS_REGEX = /^0x[a-f0-9]{64}$/;

export function normalizeSuiAddress(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  if (!HEX_ADDRESS_REGEX.test(trimmed)) return null;

  const withoutPrefix = trimmed.toLowerCase().replace(/^0x/, "");
  return `0x${withoutPrefix.padStart(64, "0")}`;
}

export function isNormalizedSuiAddress(address: string): boolean {
  return NORMALIZED_ADDRESS_REGEX.test(address);
}

export function sameSuiAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;

  const normalizedA = normalizeSuiAddress(a);
  const normalizedB = normalizeSuiAddress(b);
  if (!normalizedA || !normalizedB) return false;

  return normalizedA === normalizedB;
}

export function getSuiAddressVariants(address: string): string[] {
  const normalized = normalizeSuiAddress(address);
  if (!normalized) return [];

  const compactHex = normalized.slice(2).replace(/^0+/, "") || "0";
  const compact = `0x${compactHex}`;

  if (compact === normalized) return [normalized];
  return [normalized, compact];
}