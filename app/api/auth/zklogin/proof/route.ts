import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { decodeJwt, jwtToAddress } from "@mysten/sui/zklogin";
import { createHash, randomUUID } from "crypto";

export const runtime = "nodejs";

const EnokiErrorSchema = z.object({
  errors: z
    .array(
      z.object({
        code: z.string().optional(),
        message: z.string().optional(),
      })
    )
    .optional(),
});

const BuildProofSchema = z
  .object({
    idToken: z.string().min(1),
    maxEpoch: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
    jwtRandomness: z.string().min(1),
    ephemeralPublicKey: z.string().min(1).optional(),
    extendedEphemeralPublicKey: z.string().min(1),
    keyClaimName: z.string().min(1).optional(),
    userSalt: z.string().regex(/^\d+$/).optional(),
    legacyAddress: z.boolean().optional(),
  })
  .strict();

const ProverInputsSchema = z
  .object({
    proofPoints: z
      .object({
        a: z.array(z.string()),
        b: z.array(z.array(z.string())),
        c: z.array(z.string()),
      })
      .strict(),
    issBase64Details: z
      .object({
        value: z.string(),
        indexMod4: z.number().int(),
      })
      .strict(),
    headerBase64: z.string(),
    addressSeed: z.string(),
  })
  .strict();

const ProverResponseSchema = z.union([
  ProverInputsSchema,
  z
    .object({
      inputs: ProverInputsSchema,
    })
    .strict(),
  z
    .object({
      data: ProverInputsSchema,
    })
    .strict(),
]);

const SaltResponseSchema = z.union([
  z
    .object({
      salt: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]),
      address: z.string().optional(),
    })
    .strict(),
  z
    .object({
      data: z
        .object({
          salt: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]),
          address: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
]);

function getEnokiApiKey(): string {
  return (
    process.env.ENOKI_API_KEY?.trim() ||
    process.env.SUI_ZKLOGIN_VERIFIER_API_KEY?.trim() ||
    ""
  );
}

function isEnokiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith("enoki.mystenlabs.com");
  } catch {
    return false;
  }
}

function normalizeEnokiSaltUrl(inputUrl: string): string {
  try {
    const url = new URL(inputUrl);
    if (url.pathname.endsWith("/zklogin/salt")) {
      url.pathname = "/v1/zklogin";
    }
    return url.toString();
  } catch {
    return inputUrl;
  }
}

function normalizeEnokiProverUrl(inputUrl: string): string {
  try {
    const url = new URL(inputUrl);
    if (url.pathname.endsWith("/zklogin/prover") || url.pathname.endsWith("/zklogin/proof")) {
      url.pathname = "/v1/zklogin/zkp";
    }
    return url.toString();
  } catch {
    return inputUrl;
  }
}

async function fetchWithRetries(url: string, init: RequestInit, attempts = 2): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok || i === attempts - 1) return response;
      await new Promise((resolve) => setTimeout(resolve, 120 * (i + 1)));
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 120 * (i + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Network request failed");
}

function deriveStableSaltFromUser(userId: string, pepper: string): string {
  const digestHex = createHash("sha256")
    .update(`suicert-zklogin-salt:${userId}:${pepper}`)
    .digest("hex")
    .slice(0, 32); // 128-bit entropy window

  return BigInt(`0x${digestHex}`).toString(10);
}

async function resolveSalt(params: {
  configuredSalt: string;
  saltServiceUrl: string;
  idToken: string;
  keyClaimName: string;
}): Promise<{ salt: string; address?: string } | null> {
  if (params.configuredSalt) return { salt: params.configuredSalt };
  if (!params.saltServiceUrl) return null;

  const enoki = isEnokiUrl(params.saltServiceUrl);
  const apiKey = getEnokiApiKey();
  const requestId = randomUUID();
  const candidateUrls = enoki
    ? Array.from(new Set([normalizeEnokiSaltUrl(params.saltServiceUrl), "https://api.enoki.mystenlabs.com/v1/zklogin"]))
    : [params.saltServiceUrl];
  const failures: string[] = [];

  for (const candidateUrl of candidateUrls) {
    const res = await fetchWithRetries(candidateUrl, enoki
      ? {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
            "zklogin-jwt": params.idToken,
            "x-api-key": apiKey,
            "Request-Id": requestId,
          },
          cache: "no-store",
        }
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Request-Id": requestId,
          },
          body: JSON.stringify({ jwt: params.idToken, keyClaimName: params.keyClaimName }),
          cache: "no-store",
        });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      const snippet = raw ? raw.slice(0, 180) : "<no-body>";
      failures.push(`${candidateUrl} -> HTTP ${res.status} (${snippet})`);
      continue;
    }

    const body: unknown = await res.json().catch(() => null);
    const parsed = SaltResponseSchema.safeParse(body);
    if (!parsed.success) {
      failures.push(`${candidateUrl} -> invalid payload shape`);
      continue;
    }

    if ("data" in parsed.data) {
      return {
        salt: String(parsed.data.data.salt),
        address: parsed.data.data.address,
      };
    }

    return {
      salt: String(parsed.data.salt),
      address: parsed.data.address,
    };
  }

  const reason = failures.length
    ? failures.join(" | ")
    : "Salt service failed or returned invalid payload";
  throw new Error(reason);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BuildProofSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const configuredProverUrl = process.env.SUI_ZKLOGIN_PROVER_URL?.trim() ?? "";
  const proverUrl = configuredProverUrl || "https://api.enoki.mystenlabs.com/v1/zklogin/zkp";
  if (!proverUrl) {
    return NextResponse.json(
      { error: "SUI_ZKLOGIN_PROVER_URL is not configured" },
      { status: 501 }
    );
  }

  const keyClaimName = parsed.data.keyClaimName ?? "sub";
  const configuredSalt = parsed.data.userSalt ?? process.env.ZKLOGIN_USER_SALT?.trim() ?? "";
  const deterministicPepper = process.env.ZKLOGIN_SALT_PEPPER?.trim() ?? "";
  const configuredSaltUrl = process.env.SUI_ZKLOGIN_SALT_SERVICE_URL?.trim() ?? "";
  const saltServiceUrl = configuredSaltUrl || "https://api.enoki.mystenlabs.com/v1/zklogin";
  const enokiApiKey = getEnokiApiKey();
  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? process.env.SUI_NETWORK ?? "testnet").toLowerCase();

  if (isEnokiUrl(saltServiceUrl) && !enokiApiKey && !configuredSalt) {
    return NextResponse.json(
      { error: "Enoki salt lookup requires ENOKI_API_KEY (or SUI_ZKLOGIN_VERIFIER_API_KEY)" },
      { status: 501 }
    );
  }

  let saltFailureReason = "unknown";
  let usedDeterministicFallback = false;
  let saltContext = await resolveSalt({
    configuredSalt,
    saltServiceUrl,
    idToken: parsed.data.idToken,
    keyClaimName,
  }).catch((error) => {
    saltFailureReason = error instanceof Error ? error.message : "unknown";
    return null;
  });

  if (!saltContext) {
    if (deterministicPepper) {
      const derivedSalt = deriveStableSaltFromUser(userId, deterministicPepper);
      saltContext = { salt: derivedSalt };
      usedDeterministicFallback = true;
    }
  }

  if (!saltContext) {
    return NextResponse.json(
      {
        error:
          "Unable to resolve user salt. For Enoki, set ENOKI_API_KEY and SUI_ZKLOGIN_SALT_SERVICE_URL; otherwise set ZKLOGIN_USER_SALT.",
        details: {
          provider: isEnokiUrl(saltServiceUrl) ? "enoki" : "custom",
          saltEndpoint: saltServiceUrl,
          reason: saltFailureReason,
        },
      },
      { status: 502 }
    );
  }

  const userSalt = saltContext.salt;
  const decodedJwt = decodeJwt(parsed.data.idToken);

  const maxEpoch = String(parsed.data.maxEpoch);
  const legacyAddress = parsed.data.legacyAddress ?? (process.env.SUI_ZKLOGIN_LEGACY_ADDRESS ?? "false") === "true";
  const proverIsEnoki = isEnokiUrl(proverUrl);
  const enokiEphemeralPublicKey = parsed.data.ephemeralPublicKey ?? parsed.data.extendedEphemeralPublicKey;
  let stage: "prover-request" | "prover-parse" | "address-derive" = "prover-request";
  const candidateProverUrls = proverIsEnoki
    ? Array.from(new Set([normalizeEnokiProverUrl(proverUrl), "https://api.enoki.mystenlabs.com/v1/zklogin/zkp"]))
    : [proverUrl];
  let selectedProverUrl = proverUrl;
  const proverRequestId = randomUUID();

  try {
    let proverRes: Response | null = null;
    const networkFailures: string[] = [];

    for (const candidateUrl of candidateProverUrls) {
      selectedProverUrl = candidateUrl;

      try {
        const response = await fetchWithRetries(candidateUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(proverIsEnoki
              ? {
                  Authorization: `Bearer ${enokiApiKey}`,
                  "zklogin-jwt": parsed.data.idToken,
                  "x-api-key": enokiApiKey,
                  "Request-Id": proverRequestId,
                }
              : {
                  "Request-Id": proverRequestId,
                }),
          },
          body: JSON.stringify(
            proverIsEnoki
              ? {
                  network,
                  ephemeralPublicKey: enokiEphemeralPublicKey,
                  maxEpoch: Number.parseInt(maxEpoch, 10),
                  randomness: parsed.data.jwtRandomness,
                }
              : {
                  jwt: parsed.data.idToken,
                  extendedEphemeralPublicKey: parsed.data.extendedEphemeralPublicKey,
                  maxEpoch,
                  jwtRandomness: parsed.data.jwtRandomness,
                  salt: userSalt,
                  keyClaimName,
                }
          ),
          cache: "no-store",
        }, 3);

        if (!response.ok) {
          const raw = await response.text().catch(() => "");
          const snippet = raw ? raw.slice(0, 220) : "<no-body>";
          const rawJson: unknown = (() => {
            try {
              return raw ? JSON.parse(raw) : null;
            } catch {
              return null;
            }
          })();
          const parsedProviderError = EnokiErrorSchema.safeParse(rawJson);
          const firstProviderCode = parsedProviderError.success
            ? parsedProviderError.data.errors?.[0]?.code?.toLowerCase()
            : undefined;

          if (proverIsEnoki && firstProviderCode === "invalid_client_id") {
            const expectedClientId =
              process.env.NEXT_PUBLIC_ZKLOGIN_GOOGLE_CLIENT_ID?.trim() ||
              process.env.GOOGLE_CLIENT_ID?.trim() ||
              "<unset>";
            return NextResponse.json(
              {
                error: "Enoki rejected JWT audience as invalid client ID",
                details: {
                  provider: "enoki",
                  proverEndpoint: candidateUrl,
                  requestId: proverRequestId,
                  jwtAud: decodedJwt.aud,
                  expectedClientId,
                  reason:
                    "Google OAuth client ID used for id_token does not match client ID configured in Enoki app metadata.",
                  remediation: [
                    "In Enoki Portal, configure Google provider clientId to exactly match your Google OAuth client ID.",
                    "Ensure NEXT_PUBLIC_ZKLOGIN_GOOGLE_CLIENT_ID matches that same ID.",
                    "Restart dev server and start a fresh zkLogin flow.",
                  ],
                },
              },
              { status: 502 }
            );
          }

          if (proverIsEnoki && (response.status === 404 || response.status === 405)) {
            networkFailures.push(`${candidateUrl} -> HTTP ${response.status} (${snippet})`);
            continue;
          }

          return NextResponse.json(
            {
              error: `zkLogin prover request failed with status ${response.status}`,
              details: {
                provider: proverIsEnoki ? "enoki" : "custom",
                proverEndpoint: candidateUrl,
                reason: snippet,
                requestId: proverRequestId,
              },
            },
            { status: 502 }
          );
        }

        proverRes = response;
        break;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "fetch failed";
        networkFailures.push(`${candidateUrl} -> ${reason}`);
      }
    }

    if (!proverRes) {
      return NextResponse.json(
        {
          error: "Unable to reach zkLogin prover endpoint",
          details: {
            provider: proverIsEnoki ? "enoki" : "custom",
            proverEndpoint: selectedProverUrl,
            reason: networkFailures.join(" | ") || "fetch failed",
            requestId: proverRequestId,
          },
        },
        { status: 502 }
      );
    }

    stage = "prover-parse";
    const proverBody: unknown = await proverRes.json().catch(() => null);
    const proverParsed = ProverResponseSchema.safeParse(proverBody);
    if (!proverParsed.success) {
      return NextResponse.json(
        { error: "zkLogin prover returned malformed response", issues: proverParsed.error.issues.length },
        { status: 502 }
      );
    }

    stage = "address-derive";
    const proofInputs = "inputs" in proverParsed.data
      ? proverParsed.data.inputs
      : "data" in proverParsed.data
      ? proverParsed.data.data
      : proverParsed.data;
    const decoded = decodedJwt;
    const derivedAddress = jwtToAddress(parsed.data.idToken, userSalt, legacyAddress);
    const address = saltContext.address ?? derivedAddress;

    return NextResponse.json({
      ok: true,
      address,
      userSalt,
      saltSource: usedDeterministicFallback ? "deterministic-fallback" : "service",
      maxEpoch,
      keyClaimName,
      legacyAddress,
      idToken: parsed.data.idToken,
      iss: decoded.iss,
      aud: decoded.aud,
      proofInputs,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unexpected proof assembly failure";
    console.error("[zklogin proof]", { stage, reason });
    return NextResponse.json(
      {
        error: "Unable to build zkLogin proof payload",
        details: {
          stage,
          provider: proverIsEnoki ? "enoki" : "custom",
          proverEndpoint: selectedProverUrl,
          reason,
          requestId: proverRequestId,
        },
      },
      { status: 502 }
    );
  }
}
