import { normalizeSuiAddress } from "@/lib/wallet/address";

export interface ZkLoginProofEnvelope {
  bytes: string;
  signature: string;
  address?: string;
  maxEpoch?: string | number;
  userSignature?: string;
  proofInputs?: Record<string, unknown>;
}

export interface VerifyZkLoginProofInput {
  proof: ZkLoginProofEnvelope;
  expectedAddress?: string;
  network: string;
}

export interface VerifyZkLoginProofResult {
  verified: boolean;
  normalizedAddress?: string;
  code:
    | "VERIFIED"
    | "NOT_IMPLEMENTED"
    | "INVALID_PROOF"
    | "ADDRESS_MISMATCH"
    | "VERIFIER_ERROR";
  reason?: string;
  verifierId: string;
  metadata?: Record<string, unknown>;
}

export interface ZkLoginVerifier {
  verify(input: VerifyZkLoginProofInput): Promise<VerifyZkLoginProofResult>;
}

class FailClosedZkLoginVerifier implements ZkLoginVerifier {
  async verify(input: VerifyZkLoginProofInput): Promise<VerifyZkLoginProofResult> {
    // Parse and normalize whatever address hint is present, but never trust it as verified.
    const proofAddress = input.proof.address ? normalizeSuiAddress(input.proof.address) : undefined;
    const expectedAddress = input.expectedAddress ? normalizeSuiAddress(input.expectedAddress) : undefined;

    if (proofAddress && expectedAddress && proofAddress !== expectedAddress) {
      return {
        verified: false,
        code: "ADDRESS_MISMATCH",
        reason: "Proof address does not match expected address",
        verifierId: "fail-closed-skeleton",
        metadata: { proofAddress, expectedAddress, network: input.network },
      };
    }

    // TODO(team): Plug in actual zkLogin cryptographic verification here.
    // Expected final behavior:
    // 1) Verify proof bytes/signature against Sui verifier (or trusted verifier service).
    // 2) Derive signer address from verified proof.
    // 3) Return verified=true and normalizedAddress when cryptographically valid.
    return {
      verified: false,
      code: "NOT_IMPLEMENTED",
      reason: "zkLogin cryptographic verification is not implemented",
      verifierId: "fail-closed-skeleton",
      metadata: { proofAddress, expectedAddress, network: input.network },
    };
  }
}

export function getZkLoginVerifier(): ZkLoginVerifier {
  return new FailClosedZkLoginVerifier();
}