"use client";
// components/layout/Navbar.tsx
import Link from "next/link";
import { Shield } from "lucide-react";
import { useWalletSession } from "@/lib/wallet/context";
import { useEffect, useState } from "react";
import { performFullLogout } from "@/lib/auth/client-logout";

interface AuthSessionResponse {
  user?: { email?: string | null; name?: string | null; image?: string | null };
  zkloginAddress?: string | null;
}

export default function Navbar() {
  const { isAdmin, isIssuer } = useWalletSession();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleUserName, setGoogleUserName] = useState<string | null>(null);
  const [googleUserImage, setGoogleUserImage] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAuthStatus() {
      try {
        const sessionRes = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);

        if (!active) return;

        if (sessionRes?.ok) {
          const sessionBody = await sessionRes.json() as AuthSessionResponse;
          setGoogleConnected(Boolean(sessionBody?.user?.email));
          if (sessionBody?.user?.name) setGoogleUserName(sessionBody.user.name);
          if (sessionBody?.user?.image) setGoogleUserImage(sessionBody.user.image);
        }
      } finally {}
    }

    loadAuthStatus();

    return () => {
      active = false;
    };
  }, []);

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

        {/* Right: account + wallet */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!googleConnected && (
            <Link
              href="/auth/signin?callbackUrl=/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: "var(--radius-sm)",
                textDecoration: "none",
                border: "1.5px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Continue with Google
            </Link>
          )}

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
                      void performFullLogout("/");
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
        </div>
      </div>
    </nav>
  );
}
