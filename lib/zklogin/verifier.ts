import { normalizeSuiAddress } from "@/lib/wallet/address";
import { z } from "zod";
import { getZkLoginSignature, jwtToAddress, parseZkLoginSignature } from "@mysten/sui/zklogin";
import { fromBase64 } from "@mysten/bcs";

export interface ZkLoginProofEnvelope {
  bytes: string;
  signature: string;
  idToken?: string;
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

const INPUT_PROOF_SCHEMA = z
  .object({
    bytes: z.string().min(1),
    signature: z.string().min(1),
    idToken: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    maxEpoch: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
    userSignature: z.string().min(1).optional(),
    proofInputs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const INPUT_SCHEMA = z
  .object({
    proof: INPUT_PROOF_SCHEMA,
    expectedAddress: z.string().min(1).optional(),
    network: z.string().min(1),
  })
  .strict();

const VERIFIER_SERVICE_PROOF_SCHEMA = z
  .object({
    bytes: z.string().min(1),
    signature: z.string().min(1),
    idToken: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    maxEpoch: z.string().regex(/^\d+$/).optional(),
    userSignature: z.string().min(1).optional(),
    proofInputs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const VERIFIER_SERVICE_REQUEST_SCHEMA = z
  .object({
    network: z.string().min(1),
    expectedAddress: z.string().min(1).optional(),
    proof: VERIFIER_SERVICE_PROOF_SCHEMA,
  })
  .strict();

const VERIFIER_SERVICE_RESPONSE_SCHEMA = z
  .object({
    verified: z.boolean(),
    normalizedAddress: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    reason: z.string().optional(),
    verifierId: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const VERIFIER_SERVICE_ERROR_SCHEMA = z
  .object({
    error: z
      .object({
        code: z.string().min(1).optional(),
        message: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

const ENOKI_ADDRESS_DATA_SCHEMA = z
  .object({
    salt: z.string().regex(/^\d+$/),
    address: z.string().min(1),
    publicKey: z.string().optional(),
  })
  .strict();

const ENOKI_ADDRESS_RESPONSE_SCHEMA = z.union([
  ENOKI_ADDRESS_DATA_SCHEMA,
  z
    .object({
      data: ENOKI_ADDRESS_DATA_SCHEMA,
    })
    .strict(),
]);

const PROOF_INPUTS_ADDRESS_SEED_SCHEMA = z
  .object({
    addressSeed: z.string().min(1),
  })
  .passthrough();

const ZKLOGIN_SIGNATURE_INPUTS_SCHEMA = z
  .object({
    proofPoints: z
      .object({
        a: z.array(z.string()).length(2),
        b: z.array(z.array(z.string()).length(2)).length(2),
        c: z.array(z.string()).length(2),
      })
      .strict(),
    issBase64Details: z
      .object({
        value: z.string().min(1),
        indexMod4: z.number().int().nonnegative(),
      })
      .strict(),
    headerBase64: z.string().min(1),
    addressSeed: z.string().min(1),
  })
  .strict();

type VerifierResultCode = VerifyZkLoginProofResult["code"];

function mapServiceCode(inputCode?: string): VerifierResultCode {
  switch ((inputCode ?? "").toUpperCase()) {
    case "INVALID_PROOF":
    case "INVALID_INPUT":
    case "MALFORMED_PROOF":
      return "INVALID_PROOF";
    case "ADDRESS_MISMATCH":
      return "ADDRESS_MISMATCH";
    case "VERIFIED":
      return "VERIFIED";
    default:
      return "VERIFIER_ERROR";
  }
}

function getVerifierConfig() {
  const baseUrl = process.env.SUI_ZKLOGIN_VERIFIER_URL?.trim() ?? "";
  const apiKey = process.env.SUI_ZKLOGIN_VERIFIER_API_KEY?.trim() || process.env.ENOKI_API_KEY?.trim();
  const timeoutMs = Number.parseInt(process.env.SUI_ZKLOGIN_VERIFIER_TIMEOUT_MS ?? "8000", 10);
  const endpointPath = process.env.SUI_ZKLOGIN_VERIFIER_PATH?.trim() || "/verify";

  return {
    baseUrl,
    apiKey,
    endpointPath,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000,
  };
}

function isEnokiVerifier(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname.endsWith("enoki.mystenlabs.com");
  } catch {
    return false;
  }
}

function buildEnokiUrl(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  url.pathname = path;
  url.search = "";
  return url.toString();
}

function buildVerifierUrl(baseUrl: string, endpointPath: string): string {
  const url = new URL(baseUrl);
  const normalizedPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  url.pathname = normalizedPath;
  url.search = "";
  return url.toString();
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function tryParseSerializedZkLoginSignature(signature: string): ReturnType<typeof parseZkLoginSignature> | null {
  try {
    return parseZkLoginSignature(signature);
  } catch {
    // Some SDK versions serialize with a leading scheme byte; strip it and retry.
    try {
      const serialized = fromBase64(signature);
      if (serialized.length <= 1) return null;
      return parseZkLoginSignature(serialized.slice(1));
    } catch {
      return null;
    }
  }
}

function extractAddressSeed(proofInputs: Record<string, unknown>): string | null {
  const direct = PROOF_INPUTS_ADDRESS_SEED_SCHEMA.safeParse(proofInputs);
  if (direct.success) {
    return direct.data.addressSeed;
  }

  const snakeCaseSeed = proofInputs.address_seed;
  if (typeof snakeCaseSeed === "string" && snakeCaseSeed.length > 0) {
    return snakeCaseSeed;
  }

  return null;
}

class SuiVerifierServiceClient implements ZkLoginVerifier {
  private getParsedSignature(input: z.infer<typeof INPUT_SCHEMA>): {
    parsed: ReturnType<typeof parseZkLoginSignature>;
    signature: string;
    reconstructed: boolean;
  } | null {
    const parsed = tryParseSerializedZkLoginSignature(input.proof.signature);
    if (parsed) {
      return {
        parsed,
        signature: input.proof.signature,
        reconstructed: false,
      };
    }

    // Continue below and attempt deterministic reconstruction from supplied fields.

    if (
      !input.proof.proofInputs ||
      !input.proof.userSignature ||
      input.proof.maxEpoch === undefined
    ) {
      return null;
    }

    const parsedInputs = ZKLOGIN_SIGNATURE_INPUTS_SCHEMA.safeParse(input.proof.proofInputs);
    if (!parsedInputs.success) {
      return null;
    }

    try {
      const reconstructedSignature = getZkLoginSignature({
        inputs: parsedInputs.data,
        maxEpoch: String(input.proof.maxEpoch),
        userSignature: input.proof.userSignature,
      });

      const reconstructedParsed = tryParseSerializedZkLoginSignature(reconstructedSignature);
      if (!reconstructedParsed) {
        return null;
      }

      return {
        parsed: reconstructedParsed,
        signature: reconstructedSignature,
        reconstructed: true,
      };
    } catch {
      return null;
    }
  }

  private async verifyWithEnoki(input: z.infer<typeof INPUT_SCHEMA>): Promise<VerifyZkLoginProofResult> {
    const config = getVerifierConfig();
    const expectedAddress = input.expectedAddress
      ? normalizeSuiAddress(input.expectedAddress)
      : undefined;
    const proofAddress = input.proof.address
      ? normalizeSuiAddress(input.proof.address)
      : undefined;

    if (!config.baseUrl) {
      return {
        verified: false,
        code: "VERIFIER_ERROR",
        reason: "Sui zkLogin verifier service URL is not configured",
        verifierId: "enoki-address-validation",
      };
    }
    if (!config.apiKey) {
      return {
        verified: false,
        code: "VERIFIER_ERROR",
        reason: "Enoki API key is not configured",
        verifierId: "enoki-address-validation",
      };
    }

    const idToken = input.proof.idToken;
    if (!idToken) {
      return {
        verified: false,
        code: "INVALID_PROOF",
        reason: "Missing idToken for Enoki-backed verification",
        verifierId: "enoki-address-validation",
      };
    }

    const parsedSignatureBundle = this.getParsedSignature(input);
    if (!parsedSignatureBundle) {
      return {
        verified: false,
        code: "INVALID_PROOF",
        reason: "Malformed zkLogin signature payload",
        verifierId: "enoki-address-validation",
      };
    }
    const parsedSignature = parsedSignatureBundle.parsed;

    if (input.proof.maxEpoch !== undefined && String(input.proof.maxEpoch) !== parsedSignature.maxEpoch) {
      return {
        verified: false,
        code: "INVALID_PROOF",
        reason: "Signature maxEpoch does not match supplied proof maxEpoch",
        verifierId: "enoki-address-validation",
      };
    }

    if (input.proof.proofInputs) {
      const providedAddressSeed = extractAddressSeed(input.proof.proofInputs);
      if (!providedAddressSeed) {
        return {
          verified: false,
          code: "INVALID_PROOF",
          reason: "proofInputs.addressSeed is required for verification",
          verifierId: "enoki-address-validation",
        };
      }

      if (providedAddressSeed !== parsedSignature.inputs.addressSeed) {
        return {
          verified: false,
          code: "INVALID_PROOF",
          reason: "Signature payload does not match proof inputs",
          verifierId: "enoki-address-validation",
        };
      }
    }

    try {
      const response = await fetch(buildEnokiUrl(config.baseUrl, "/v1/zklogin"), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "zklogin-jwt": idToken,
        },
        cache: "no-store",
        signal: createTimeoutSignal(config.timeoutMs),
      });

      const rawBody: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          verified: false,
          code: "VERIFIER_ERROR",
          reason: `Enoki address lookup failed with status ${response.status}`,
          verifierId: "enoki-address-validation",
          metadata: { status: response.status },
        };
      }

      const parsedBody = ENOKI_ADDRESS_RESPONSE_SCHEMA.safeParse(rawBody);
      if (!parsedBody.success) {
        return {
          verified: false,
          code: "VERIFIER_ERROR",
          reason: "Enoki address response is malformed",
          verifierId: "enoki-address-validation",
          metadata: { issues: parsedBody.error.issues.length },
        };
      }

      const enokiData = "data" in parsedBody.data ? parsedBody.data.data : parsedBody.data;
      const normalizedAddress = normalizeSuiAddress(enokiData.address);
      if (!normalizedAddress) {
        return {
          verified: false,
          code: "VERIFIER_ERROR",
          reason: "Enoki returned an invalid Sui address",
          verifierId: "enoki-address-validation",
        };
      }

      const legacyAddress = (process.env.SUI_ZKLOGIN_LEGACY_ADDRESS ?? "false") === "true";
      const derivedAddress = normalizeSuiAddress(
        jwtToAddress(idToken, enokiData.salt, legacyAddress)
      );
      if (!derivedAddress || derivedAddress !== normalizedAddress) {
        return {
          verified: false,
          code: "VERIFIER_ERROR",
          reason: "Derived address does not match Enoki address for this JWT",
          verifierId: "enoki-address-validation",
          metadata: { derivedAddress, normalizedAddress },
        };
      }

      if (proofAddress && proofAddress !== normalizedAddress) {
        return {
          verified: false,
          code: "ADDRESS_MISMATCH",
          reason: "Proof address does not match Enoki JWT-derived address",
          verifierId: "enoki-address-validation",
          metadata: { proofAddress, normalizedAddress },
        };
      }

      if (expectedAddress && expectedAddress !== normalizedAddress) {
        return {
          verified: false,
          code: "ADDRESS_MISMATCH",
          reason: "Expected address does not match Enoki JWT-derived address",
          verifierId: "enoki-address-validation",
          metadata: { expectedAddress, normalizedAddress },
        };
      }

      return {
        verified: true,
        normalizedAddress,
        code: "VERIFIED",
        verifierId: "enoki-address-validation",
        metadata: {
          provider: "enoki",
          addressValidated: true,
          signatureReconstructed: parsedSignatureBundle.reconstructed,
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown Enoki verification error";
      return {
        verified: false,
        code: "VERIFIER_ERROR",
        reason,
        verifierId: "enoki-address-validation",
      };
    }
  }

  async verify(input: VerifyZkLoginProofInput): Promise<VerifyZkLoginProofResult> {
    const parsedInput = INPUT_SCHEMA.safeParse(input);
    if (!parsedInput.success) {
      return {
        verified: false,
        code: "INVALID_PROOF",
        reason: "Invalid zkLogin verifier input",
        verifierId: "sui-verifier-service",
        metadata: { issues: parsedInput.error.issues.length },
      };
    }

    const expectedAddress = parsedInput.data.expectedAddress
      ? normalizeSuiAddress(parsedInput.data.expectedAddress)
      : undefined;
    if (parsedInput.data.expectedAddress && !expectedAddress) {
      return {
        verified: false,
        code: "INVALID_PROOF",
        reason: "Expected address is not a valid Sui address",
        verifierId: "sui-verifier-service",
      };
    }

    const proofAddress = parsedInput.data.proof.address
      ? normalizeSuiAddress(parsedInput.data.proof.address)
      : undefined;
    if (parsedInput.data.proof.address && !proofAddress) {
      return {
        verified: false,
        code: "INVALID_PROOF",
        reason: "Proof address is not a valid Sui address",
        verifierId: "sui-verifier-service",
      };
    }

    if (proofAddress && expectedAddress && proofAddress !== expectedAddress) {
      return {
        verified: false,
        code: "ADDRESS_MISMATCH",
        reason: "Proof address does not match expected address",
        verifierId: "sui-verifier-service",
        metadata: { proofAddress, expectedAddress, network: parsedInput.data.network },
      };
    }

    const config = getVerifierConfig();
    if (!config.baseUrl) {
      return {
        verified: false,
        code: "VERIFIER_ERROR",
        reason: "Sui zkLogin verifier service URL is not configured",
        verifierId: "sui-verifier-service",
      };
    }

    if (isEnokiVerifier(config.baseUrl)) {
      return this.verifyWithEnoki(parsedInput.data);
    }

    const servicePayload = VERIFIER_SERVICE_REQUEST_SCHEMA.parse({
      network: parsedInput.data.network,
      expectedAddress,
      proof: {
        bytes: parsedInput.data.proof.bytes,
        signature: parsedInput.data.proof.signature,
        idToken: parsedInput.data.proof.idToken,
        address: proofAddress,
        maxEpoch:
          parsedInput.data.proof.maxEpoch === undefined
            ? undefined
            : String(parsedInput.data.proof.maxEpoch),
        userSignature: parsedInput.data.proof.userSignature,
        proofInputs: parsedInput.data.proof.proofInputs,
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    try {
      const response = await fetch(buildVerifierUrl(config.baseUrl, config.endpointPath), {
        method: "POST",
        headers,
        body: JSON.stringify(servicePayload),
        cache: "no-store",
        signal: createTimeoutSignal(config.timeoutMs),
      });

      const rawBody: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const parsedError = VERIFIER_SERVICE_ERROR_SCHEMA.safeParse(rawBody);
        return {
          verified: false,
          code: mapServiceCode(parsedError.data?.error.code),
          reason:
            parsedError.data?.error.message ??
            `Verifier service request failed with status ${response.status}`,
          verifierId: "sui-verifier-service",
          metadata: { status: response.status },
        };
      }

      const parsedResponse = VERIFIER_SERVICE_RESPONSE_SCHEMA.safeParse(rawBody);
      if (!parsedResponse.success) {
        return {
          verified: false,
          code: "VERIFIER_ERROR",
          reason: "Verifier service returned malformed response",
          verifierId: "sui-verifier-service",
          metadata: { issues: parsedResponse.error.issues.length },
        };
      }

      const service = parsedResponse.data;
      if (!service.verified) {
        return {
          verified: false,
          code: mapServiceCode(service.code),
          reason: service.reason ?? "Verifier service rejected zkLogin proof",
          verifierId: service.verifierId,
          metadata: service.metadata,
        };
      }

      const normalizedAddress = service.normalizedAddress
        ? normalizeSuiAddress(service.normalizedAddress)
        : null;
      if (!normalizedAddress) {
        return {
          verified: false,
          code: "VERIFIER_ERROR",
          reason: "Verifier service did not return a valid normalized address",
          verifierId: service.verifierId,
          metadata: service.metadata,
        };
      }

      if (expectedAddress && normalizedAddress !== expectedAddress) {
        return {
          verified: false,
          code: "ADDRESS_MISMATCH",
          reason: "Verifier service address does not match expected address",
          verifierId: service.verifierId,
          metadata: { ...(service.metadata ?? {}), expectedAddress, normalizedAddress },
        };
      }

      return {
        verified: true,
        normalizedAddress,
        code: "VERIFIED",
        reason: service.reason,
        verifierId: service.verifierId,
        metadata: service.metadata,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown verifier service error";
      return {
        verified: false,
        code: "VERIFIER_ERROR",
        reason,
        verifierId: "sui-verifier-service",
      };
    }
  }
}

export function getZkLoginVerifier(): ZkLoginVerifier {
  return new SuiVerifierServiceClient();
}