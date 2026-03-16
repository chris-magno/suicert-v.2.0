import type { Metadata } from "next";
import "./globals.css";
import WalletProviders from "@/components/wallet/WalletProviders";

export const metadata: Metadata = {
  title: "SUICERT — Blockchain Certifications",
  description: "High-trust Soulbound Token certifications on the Sui blockchain. Automated proof-of-attendance, AI-verified issuers.",
  keywords: ["blockchain", "certificate", "NFT", "Sui", "Web3", "credential"],
  openGraph: {
    title: "SUICERT",
    description: "Real-world achievements, immutably verified on Sui.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <WalletProviders>
          {children}
        </WalletProviders>
      </body>
    </html>
  );
}
