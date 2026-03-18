import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";

const NETWORKS = new Set(["mainnet", "testnet", "devnet", "localnet"]);

const NETWORK_URLS: Record<string, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
  localnet: "http://127.0.0.1:9000",
};

const EnokiAppMetadataSchema = z
  .object({
    data: z
      .object({
        authenticationProviders: z
          .array(
            z.object({
              providerType: z.string(),
              clientId: z.string().min(1),
            })
          )
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

function resolveNetwork(): "mainnet" | "testnet" | "devnet" | "localnet" {
  const raw = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? process.env.SUI_NETWORK ?? "testnet").toLowerCase();
  return NETWORKS.has(raw) ? (raw as "mainnet" | "testnet" | "devnet" | "localnet") : "testnet";
}

async function getCurrentEpoch(rpcUrl: string): Promise<number> {
  const methods = ["suix_getLatestSuiSystemState", "sui_getLatestSuiSystemState"];

  for (const method of methods) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      cache: "no-store",
    });

    if (!response.ok) continue;
    const body: unknown = await response.json().catch(() => null);
    const epochRaw =
      (body as { result?: { epoch?: string | number } } | null)?.result?.epoch;
    const epoch = Number.parseInt(String(epochRaw ?? ""), 10);
    if (Number.isFinite(epoch)) return epoch;
  }

  throw new Error("Unable to read current epoch from Sui RPC");
}

function getEnokiApiKey(): string {
  return (
    process.env.ENOKI_API_KEY?.trim() ||
    process.env.SUI_ZKLOGIN_VERIFIER_API_KEY?.trim() ||
    ""
  );
}

function isEnokiHost(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("enoki.mystenlabs.com");
  } catch {
    return false;
  }
}

async function getEnokiGoogleClientId(): Promise<string | null> {
  const apiKey = getEnokiApiKey();
  if (!apiKey) return null;

  const proverUrl = process.env.SUI_ZKLOGIN_PROVER_URL?.trim() ?? "";
  const saltUrl = process.env.SUI_ZKLOGIN_SALT_SERVICE_URL?.trim() ?? "";
  const candidates = [proverUrl, saltUrl, "https://api.enoki.mystenlabs.com/v1/zklogin"]
    .filter(Boolean)
    .filter(isEnokiHost)
    .map((input) => {
      const url = new URL(input);
      url.pathname = "/v1/app";
      url.search = "";
      return url.toString();
    });

  for (const endpoint of Array.from(new Set(candidates))) {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    }).catch(() => null);

    if (!res || !res.ok) continue;
    const body: unknown = await res.json().catch(() => null);
    const parsed = EnokiAppMetadataSchema.safeParse(body);
    if (!parsed.success) continue;

    const googleProvider = parsed.data.data.authenticationProviders?.find(
      (provider) => provider.providerType.toLowerCase() === "google"
    );
    if (googleProvider?.clientId) return googleProvider.clientId;
  }

  return null;
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const network = resolveNetwork();
  const rpcUrl = NETWORK_URLS[network] ?? NETWORK_URLS.testnet;
  const epochWindowRaw = Number.parseInt(process.env.SUI_ZKLOGIN_MAX_EPOCH_WINDOW ?? "10", 10);
  const epochWindow = Number.isFinite(epochWindowRaw) && epochWindowRaw > 0 ? epochWindowRaw : 10;

  try {
    const currentEpoch = await getCurrentEpoch(rpcUrl);

    const envGoogleClientId =
      process.env.NEXT_PUBLIC_ZKLOGIN_GOOGLE_CLIENT_ID?.trim() ||
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      "";
    const enokiGoogleClientId = await getEnokiGoogleClientId();
    const googleClientId = enokiGoogleClientId || envGoogleClientId;
    const warnings: string[] = [];

    if (enokiGoogleClientId && envGoogleClientId && enokiGoogleClientId !== envGoogleClientId) {
      warnings.push("Enoki Google client ID differs from local env; using Enoki value to prevent invalid_client_id.");
    }
    if (!googleClientId) {
      warnings.push("No Google client ID resolved for zkLogin OAuth bootstrap.");
    }

    return NextResponse.json({
      ok: true,
      network,
      rpcUrl,
      currentEpoch,
      maxEpoch: currentEpoch + epochWindow,
      epochWindow,
      oauth: {
        googleClientId,
        source: enokiGoogleClientId ? "enoki-app-metadata" : "env",
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      },
      warnings,
      proverConfigured: Boolean(process.env.SUI_ZKLOGIN_PROVER_URL?.trim()),
      saltConfigured: Boolean(
        process.env.ZKLOGIN_USER_SALT?.trim() || process.env.SUI_ZKLOGIN_SALT_SERVICE_URL?.trim()
      ),
    });
  } catch (error) {
    console.error("[zklogin nonce]", error);
    return NextResponse.json(
      { error: "Unable to bootstrap zkLogin nonce context" },
      { status: 502 }
    );
  }
}
