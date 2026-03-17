"use client";
// components/layout/Navbar.tsx
import Link from "next/link";
import { Shield } from "lucide-react";
import ConnectButton from "@/components/wallet/ConnectButton";
import GoogleSignInButton from "@/components/wallet/GoogleSignInButton";
import { useWalletSession } from "@/lib/wallet/context";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useState } from "react";

interface AuthSessionResponse {
  user?: { email?: string | null };
}

interface ZkIdentityResponse {
  identity?: { zkloginAddress?: string | null };
}

interface WalletBindResponse {
  walletBoundAddress?: string | null;
}

export default function Navbar() {
  const account           = useCurrentAccount();
  const { isAdmin, isIssuer } = useWalletSession();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [zkloginVerified, setZkloginVerified] = useState(false);
  const [walletBound, setWalletBound] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadAuthStatus() {
      try {
        const [sessionRes, zkRes, bindRes] = await Promise.all([
          fetch("/api/auth/session", { cache: "no-store" }).catch(() => null),
          fetch("/api/auth/zklogin/verify", { cache: "no-store" }).catch(() => null),
          fetch("/api/auth/wallet/bind", { cache: "no-store" }).catch(() => null),
        ]);

        if (!active) return;

        if (sessionRes?.ok) {
          const sessionBody = await sessionRes.json() as AuthSessionResponse;
          setGoogleConnected(Boolean(sessionBody?.user?.email));
        } else {
          setGoogleConnected(false);
        }

        if (zkRes?.ok) {
          const zkBody = await zkRes.json() as ZkIdentityResponse;
          setZkloginVerified(Boolean(zkBody?.identity?.zkloginAddress));
        } else {
          setZkloginVerified(false);
        }

        if (bindRes?.ok) {
          const bindBody = await bindRes.json() as WalletBindResponse;
          setWalletBound(Boolean(bindBody?.walletBoundAddress));
        } else {
          setWalletBound(false);
        }
      } finally {
        if (active) setStatusLoading(false);
      }
    }

    loadAuthStatus();

    return () => {
      active = false;
    };
  }, [account?.address]);

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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[
              {
                label: "Google",
                ok: googleConnected,
                loading: statusLoading,
                href: "/auth/signin",
              },
              {
                label: "zkLogin",
                ok: zkloginVerified,
                loading: statusLoading,
                href: "/auth/zklogin?callbackUrl=/dashboard",
              },
              {
                label: "Wallet",
                ok: walletBound,
                loading: statusLoading,
                href: "/issuer?tab=apply",
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                title={item.loading ? `${item.label}: checking` : `${item.label}: ${item.ok ? "ready" : "required"}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  borderRadius: 99,
                  textDecoration: "none",
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  color: item.loading ? "var(--text-muted)" : item.ok ? "#047857" : "#b45309",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}
              >
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: item.loading ? "#9ca3af" : item.ok ? "#10b981" : "#f59e0b",
                }} />
                {item.label}
              </Link>
            ))}
          </div>
          {!account && <GoogleSignInButton />}
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
