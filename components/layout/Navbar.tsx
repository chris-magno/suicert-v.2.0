"use client";
// components/layout/Navbar.tsx
import Link from "next/link";
import { Shield } from "lucide-react";
import ConnectButton from "@/components/wallet/ConnectButton";
import GoogleSignInButton from "@/components/wallet/GoogleSignInButton";
import { useWalletSession } from "@/lib/wallet/context";
import { useCurrentAccount } from "@mysten/dapp-kit";

export default function Navbar() {
  const account           = useCurrentAccount();
  const { isAdmin, isIssuer } = useWalletSession();

  const navLinks = [
    { href: "/dashboard", label: "Explore" },
    ...(isIssuer ? [{ href: "/issuer",  label: "Issuer Portal" }] : []),
    ...(isAdmin  ? [{ href: "/admin",   label: "Admin" }]         : []),
  ];

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 50,
      background: "rgba(249,248,246,0.92)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto", padding: "0 24px",
        display: "flex", alignItems: "center", height: 60, gap: 24,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #4DA2FF, #97EFE9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={16} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            SUI<span style={{ color: "var(--accent)" }}>CERT</span>
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href} style={{
              padding: "6px 12px", borderRadius: "var(--radius-sm)",
              color: "var(--text-secondary)", textDecoration: "none",
              fontSize: 14, fontWeight: 500, transition: "background 0.15s, color 0.15s",
            }}
              onMouseEnter={(e) => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = "var(--bg-subtle)"; el.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = "transparent"; el.style.color = "var(--text-secondary)"; }}
            >{item.label}</Link>
          ))}
        </div>

        {/* Right: wallet + google */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!account && <GoogleSignInButton />}
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
