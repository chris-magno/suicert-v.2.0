import { getUserIdentityByUserId } from "@/lib/supabase";

export type AuthFlowStep = "layer2_zklogin" | "layer3_wallet_bind" | "layer4_signature_verify" | "done";

const NETWORK_URLS: Record<string, string> = {
  mainnet: "https://fullnode.mainnet.sui.io:443",
  testnet: "https://fullnode.testnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
  localnet: "http://127.0.0.1:9000",
};

function resolveRpcUrl(): string {
  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? process.env.SUI_NETWORK ?? "testnet").toLowerCase();
  return NETWORK_URLS[network] ?? NETWORK_URLS.testnet;
}

export async function getCurrentSuiEpoch(): Promise<number> {
  const rpcUrl = resolveRpcUrl();
  const methods = ["suix_getLatestSuiSystemState", "sui_getLatestSuiSystemState"];

  for (const method of methods) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      cache: "no-store",
    }).catch(() => null);

    if (!response?.ok) continue;

    const body = await response.json().catch(() => null) as { result?: { epoch?: string | number } } | null;
    const epoch = Number.parseInt(String(body?.result?.epoch ?? ""), 10);
    if (Number.isFinite(epoch)) return epoch;
  }

  throw new Error("Unable to fetch current Sui epoch.");
}

interface ResolveStepResult {
  step: AuthFlowStep;
  currentEpoch: number | null;
  zkMaxEpoch: number | null;
  zkEpochValid: boolean;
  canSkipWallet: boolean;
}

export async function resolveCurrentStep(userId: string): Promise<ResolveStepResult> {
  const identity = await getUserIdentityByUserId(userId);

  let currentEpoch: number | null = null;
  let zkEpochValid = false;
  let zkMaxEpoch: number | null = null;

  if (typeof identity?.zkMaxEpoch === "number") {
    zkMaxEpoch = identity.zkMaxEpoch;
    currentEpoch = await getCurrentSuiEpoch().catch(() => null);
    zkEpochValid = typeof currentEpoch === "number" && currentEpoch <= identity.zkMaxEpoch;
  }

  if (!identity?.zkloginAddress || !zkEpochValid) {
    return {
      step: "layer2_zklogin",
      currentEpoch,
      zkMaxEpoch,
      zkEpochValid,
      canSkipWallet: true,
    };
  }

  const hasBoundWallet = Boolean(identity.walletBoundAddress);
  const skippedWallet = Boolean(identity.walletBindingSkippedAt);

  if (!hasBoundWallet) {
    if (skippedWallet) {
      return {
        step: "done",
        currentEpoch,
        zkMaxEpoch,
        zkEpochValid,
        canSkipWallet: true,
      };
    }

    return {
      step: "layer3_wallet_bind",
      currentEpoch,
      zkMaxEpoch,
      zkEpochValid,
      canSkipWallet: true,
    };
  }

  if (!identity.walletSignatureVerified) {
    return {
      step: "layer4_signature_verify",
      currentEpoch,
      zkMaxEpoch,
      zkEpochValid,
      canSkipWallet: true,
    };
  }

  return {
    step: "done",
    currentEpoch,
    zkMaxEpoch,
    zkEpochValid,
    canSkipWallet: true,
  };
}
