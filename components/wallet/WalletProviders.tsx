"use client";
// components/wallet/WalletProviders.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";
import type { ReactNode } from "react";
import { WalletSessionProvider } from "@/lib/wallet/context";
import { ToastProvider } from "@/components/ui/ToastProvider";

const { networkConfig } = createNetworkConfig({
  testnet: { url: "https://fullnode.testnet.sui.io:443", network: "testnet" as const },
  mainnet: { url: "https://fullnode.mainnet.sui.io:443", network: "mainnet" as const },
  devnet:  { url: "https://fullnode.devnet.sui.io:443",  network: "devnet"  as const },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as
  "testnet" | "mainnet" | "devnet";

export default function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={network}>
        <WalletProvider autoConnect preferredWallets={["Slush Wallet", "Suiet"]}>
          <ToastProvider>
            <WalletSessionProvider>
              {children}
            </WalletSessionProvider>
          </ToastProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
