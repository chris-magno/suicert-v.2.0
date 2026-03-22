"use client";
// components/layout/Navbar.tsx
import Link from "next/link";
import { Shield } from "lucide-react";
import ConnectButton from "@/components/wallet/ConnectButton";
import { useWalletSession } from "@/lib/wallet/context";
import { sameSuiAddress } from "@/lib/wallet/address";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useRef, useState } from "react";
import { signOut as clientSignOut } from "next-auth/react";
import { useToast } from "@/components/ui/ToastProvider";

interface AuthSessionResponse {
  user?: { email?: string | null; name?: string | null; image?: string | null };
  zkloginAddress?: string | null;
}

interface IdentityStatusResponse {
  ok?: boolean;
  authenticated?: boolean;
  user?: { email?: string | null; name?: string | null; image?: string | null };
  identity?: { zkloginAddress?: string | null; walletBoundAddress?: string | null };
  gates?: { l1ZkIdentity?: boolean };
}

interface WalletBindResponse {
  walletBoundAddress?: string | null;
}

export default function Navbar() {
  const account           = useCurrentAccount();
  const { isAdmin, isIssuer, authenticated } = useWalletSession();
  const { toast } = useToast();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [zkloginVerified, setZkloginVerified] = useState(false);
  const [walletBoundAddress, setWalletBoundAddress] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [googleUserName, setGoogleUserName] = useState<string | null>(null);
  const [googleUserImage, setGoogleUserImage] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const lastWalletMismatchToastRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAuthStatus() {
      try {
        const [identityRes, sessionRes, bindRes] = await Promise.all([
          fetch("/api/auth/identity/status", { cache: "no-store" }).catch(() => null),
          fetch("/api/auth/session", { cache: "no-store" }).catch(() => null),
          fetch("/api/auth/wallet/bind", { cache: "no-store" }).catch(() => null),
        ]);

        if (!active) return;

        if (identityRes?.ok) {
          const identityBody = await identityRes.json() as IdentityStatusResponse;
          setGoogleConnected(Boolean(identityBody?.user?.email));
          if (identityBody?.user?.name) setGoogleUserName(identityBody.user.name);
          if (identityBody?.user?.image) setGoogleUserImage(identityBody.user.image);

          const linked = Boolean(identityBody?.identity?.zkloginAddress)
            || Boolean(identityBody?.gates?.l1ZkIdentity);
          setZkloginVerified(linked);
          setWalletBoundAddress(identityBody?.identity?.walletBoundAddress ?? null);
        }

        if (sessionRes?.ok) {
          const sessionBody = await sessionRes.json() as AuthSessionResponse;
          if (!identityRes?.ok) {
            setGoogleConnected(Boolean(sessionBody?.user?.email));
          }
          if (sessionBody?.user?.name) setGoogleUserName(sessionBody.user.name);
          if (sessionBody?.user?.image) setGoogleUserImage(sessionBody.user.image);

          // Fast restore path: session already includes linked zkloginAddress.
          if (sessionBody?.zkloginAddress) {
            setZkloginVerified(true);
          }
        }

        if (bindRes?.ok) {
          const bindBody = await bindRes.json() as WalletBindResponse;
          setWalletBoundAddress(bindBody?.walletBoundAddress ?? null);
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
  const walletConnected = Boolean(account?.address);
  const walletBindMatchesCurrent = account?.address
    ? sameSuiAddress(walletBoundAddress, account.address)
    : Boolean(walletBoundAddress);
  const maskedBoundAddress = walletBoundAddress
    ? `${walletBoundAddress.slice(0, 6)}...${walletBoundAddress.slice(-4)}`
    : null;
  const maskedConnectedAddress = account?.address
    ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    : null;

  const onboarding = (() => {
    if (statusLoading) {
      return {
        caption: "Checking identity gates...",
        label: "Loading",
        href: "/profile",
        tone: "neutral" as const,
      };
    }

    if (!googleConnected) {
      return {
        caption: "Start here",
        label: "1) Sign in with Google zkLogin",
        href: "/auth/signin?callbackUrl=/dashboard",
        tone: "primary" as const,
      };
    }

    if (!zkloginVerified) {
      return {
        caption: "Next step",
        label: "2) Complete zkLogin verification",
        href: "/auth/zklogin?callbackUrl=/dashboard",
        tone: "warning" as const,
      };
    }

    if (!walletConnected || !authenticated) {
      return {
        caption: "Next step",
        label: "3) Sign wallet challenge",
        href: "/profile",
        tone: "warning" as const,
      };
    }

    if (!walletBindMatchesCurrent) {
      return {
        caption: "Next step",
        label: "4) Bind current wallet",
        href: "/issuer?tab=apply",
        tone: "warning" as const,
      };
    }

    return {
      caption: "Ready",
      label: "All gates passed - open issuer flow",
      href: "/issuer",
      tone: "success" as const,
    };
  })();

  useEffect(() => {
    if (!account?.address || !walletBoundAddress) {
      lastWalletMismatchToastRef.current = null;
      return;
    }

    if (sameSuiAddress(walletBoundAddress, account.address)) {
      lastWalletMismatchToastRef.current = null;
      return;
    }

    const mismatchKey = `${walletBoundAddress.toLowerCase()}|${account.address.toLowerCase()}`;
    if (lastWalletMismatchToastRef.current === mismatchKey) return;
    lastWalletMismatchToastRef.current = mismatchKey;

    toast({
      title: "Wallet mismatch detected",
      description: `Bound: ${maskedBoundAddress ?? "unknown"} | Connected: ${maskedConnectedAddress ?? "unknown"}`,
      variant: "warning",
      durationMs: 5200,
    });
  }, [account?.address, walletBoundAddress, maskedBoundAddress, maskedConnectedAddress, toast]);

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

        {/* Right: step-based onboarding + wallet */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {onboarding.caption}
              </span>
              <Link
                href={onboarding.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 10px",
                  borderRadius: 99,
                  textDecoration: "none",
                  border: "1px solid var(--border)",
                  background: onboarding.tone === "primary"
                    ? "linear-gradient(135deg, #4DA2FF, #097EED)"
                    : "var(--bg-card)",
                  color: onboarding.tone === "primary"
                    ? "white"
                    : onboarding.tone === "success"
                      ? "#047857"
                      : onboarding.tone === "warning"
                        ? "#b45309"
                        : "var(--text-muted)",
                  fontSize: 11,
                  fontWeight: 700,
                }}
                title={onboarding.label}
              >
                {onboarding.label}
              </Link>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[
              {
                label: "L1 zkLogin",
                ok: zkloginVerified,
                loading: statusLoading,
                href: "/auth/zklogin?callbackUrl=/dashboard",
              },
              {
                label: "L2 Wallet",
                ok: walletConnected,
                loading: false,
                href: "/profile",
              },
              {
                label: "L3 Signature",
                ok: authenticated,
                loading: false,
                href: "/profile",
              },
              {
                label: "L4 Execute",
                ok: walletBindMatchesCurrent,
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
          </div>
          {googleConnected && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setProfileMenuOpen((v) => !v)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "1.5px solid var(--border)",
                  background: "var(--bg-card)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                }}
                title="Account menu"
              >
                {googleUserImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={googleUserImage} alt={googleUserName ?? "Profile"} width={32} height={32} style={{ width: 32, height: 32, borderRadius: "50%" }} />
                ) : (
                  <span>{(googleUserName ?? "U").charAt(0).toUpperCase()}</span>
                )}
              </button>

              {profileMenuOpen && (
                <div
                  onMouseLeave={() => setProfileMenuOpen(false)}
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    minWidth: 200,
                    borderRadius: "var(--radius)",
                    background: "var(--bg-card)",
                    border: "1.5px solid var(--border)",
                    boxShadow: "var(--shadow-lg)",
                    zIndex: 60,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
                    {googleUserName ?? "Google account"}
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setProfileMenuOpen(false)}
                    style={{ display: "block", padding: "10px 12px", textDecoration: "none", color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}
                  >
                    My Profile
                  </Link>
                  <button
                    onClick={() => {
                      void clientSignOut({ callbackUrl: "/" });
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      borderTop: "1px solid var(--border)",
                      background: "transparent",
                      color: "#dc2626",
                      padding: "10px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
