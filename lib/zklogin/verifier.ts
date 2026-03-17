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

class DevBypassZkLoginVerifier implements ZkLoginVerifier {
  async verify(input: VerifyZkLoginProofInput): Promise<VerifyZkLoginProofResult> {
    const proofAddress = input.proof.address ? normalizeSuiAddress(input.proof.address) : undefined;
    const expectedAddress = input.expectedAddress ? normalizeSuiAddress(input.expectedAddress) : undefined;

    const selectedAddress = proofAddress ?? expectedAddress;
    if (!selectedAddress) {
      return {
        verified: false,
        code: "INVALID_PROOF",
        reason: "Dev verifier requires proof.address or expectedAddress",
        verifierId: "dev-bypass",
      };
    }

    if (expectedAddress && selectedAddress !== expectedAddress) {
      return {
        verified: false,
        code: "ADDRESS_MISMATCH",
        reason: "Proof address does not match expected address",
        verifierId: "dev-bypass",
        metadata: { proofAddress: selectedAddress, expectedAddress },
      };
    }

    return {
      verified: true,
      normalizedAddress: selectedAddress,
      code: "VERIFIED",
      verifierId: "dev-bypass",
      metadata: {
        warning: "Development-only zkLogin verifier bypass in use",
        network: input.network,
      },
    };
  }
}

export function getZkLoginVerifier(): ZkLoginVerifier {
  if (process.env.NODE_ENV !== "production" && process.env.ZKLOGIN_DEV_BYPASS === "true") {
    return new DevBypassZkLoginVerifier();
  }
  return new FailClosedZkLoginVerifier();
}