"use client";
// components/wallet/ConnectButton.tsx
import { ConnectModal, useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { useEffect, useRef, useState } from "react";
import { useWalletSession } from "@/lib/wallet/context";
import { useToast } from "@/components/ui/ToastProvider";

export default function ConnectButton() {
  const account                = useCurrentAccount();
  const { mutate: disconnect } = useDisconnectWallet();
  const { session, loading, authenticated, authenticating, authError, authenticate } = useWalletSession();
  const { toast }              = useToast();
  const [open, setOpen]        = useState(false);
  const [menuOpen, setMenuOpen]= useState(false);
  const [authOnConnectRequested, setAuthOnConnectRequested] = useState(false);
  const previousAddressRef = useRef<string | null>(null);
  const previousAuthErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!account?.address) {
      setAuthOnConnectRequested(false);
      return;
    }

    // Only auto-authenticate after explicit connect intent, never on passive reconnect/reload.
    if (!authOnConnectRequested) return;
    if (authenticated || authenticating) {
      if (authenticated) setAuthOnConnectRequested(false);
      return;
    }

    void authenticate()
      .then((ok) => {
        if (ok) {
          toast({ title: "Wallet authenticated", description: "Signature verified successfully.", variant: "success" });
        }
      })
      .finally(() => {
        setAuthOnConnectRequested(false);
      });
  }, [account?.address, authOnConnectRequested, authenticated, authenticating, authenticate, toast]);

  useEffect(() => {
    const next = account?.address ?? null;
    const prev = previousAddressRef.current;
    previousAddressRef.current = next;

    if (!next) return;

    if (prev === next) return;
    toast({ title: "Wallet connected", description: "You can now sign to authenticate.", variant: "info" });
  }, [account?.address, toast]);

  useEffect(() => {
    if (!authError) {
      previousAuthErrorRef.current = null;
      return;
    }

    if (previousAuthErrorRef.current === authError) return;
    previousAuthErrorRef.current = authError;
    toast({ title: "Authentication failed", description: authError, variant: "error", durationMs: 4200 });
  }, [authError, toast]);

  const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
    admin:  { bg: "#fee2e2", color: "#dc2626" },
    issuer: { bg: "#d1fae5", color: "#059669" },
    user:   { bg: "#f3f4f6", color: "#6b7280" },
  };

  if (!account) {
    return (
      <ConnectModal
        trigger={
          <button
            onClick={() => {
              setAuthOnConnectRequested(true);
              setOpen(true);
            }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: "var(--radius-sm)",
              background: "linear-gradient(135deg, #4DA2FF, #097EED)",
              color: "white", border: "none", cursor: "pointer",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
            }}
          >
            🔗 Connect Wallet
          </button>
        }
        open={open}
        onOpenChange={setOpen}
      />
    );
  }

  const short = `${account.address.slice(0, 6)}...${account.address.slice(-4)}`;
  const role  = session?.role ?? "user";
  const rs    = ROLE_STYLE[role] ?? ROLE_STYLE.user;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 12px", borderRadius: "var(--radius-sm)",
          border: "1.5px solid var(--border)", background: "var(--bg-card)",
          cursor: "pointer",
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: loading ? "#f59e0b" : "#10b981", flexShrink: 0,
        }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
          {short}
        </span>
        <span style={{
          fontSize: 10, padding: "1px 6px", borderRadius: 99,
          fontWeight: 700, background: rs.bg, color: rs.color,
          letterSpacing: "0.04em",
        }}>
          {role.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>▾</span>
      </button>

      {menuOpen && (
        <div
          onMouseLeave={() => setMenuOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            background: "var(--bg-card)", border: "1.5px solid var(--border)",
            borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)",
            minWidth: 230, zIndex: 200, overflow: "hidden",
          }}
        >
          {/* Address + role header */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-subtle)" }}>
            <p style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)", wordBreak: "break-all", marginBottom: 4 }}>
              {account.address.slice(0, 16)}...{account.address.slice(-8)}
            </p>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, fontWeight: 700, background: rs.bg, color: rs.color }}>
                {role.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet"}
              </span>
            </div>
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: authenticated ? "var(--mint)" : "var(--coral)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: authenticated ? "var(--mint)" : "var(--coral)" }} />
              {authenticated ? "Wallet authenticated" : "Wallet not authenticated"}
            </div>
          </div>

          {/* Menu links */}
          {[
            { href: "/profile",   label: "My Profile",       icon: "👤" },
            { href: "/dashboard", label: "Explore Events",    icon: "🎓" },
            ...(role === "issuer" || role === "admin"
              ? [{ href: "/issuer", label: "Issuer Portal",   icon: "🏢" }]
              : [{ href: "/issuer", label: "Become an Issuer",icon: "🏢" }]
            ),
            ...(role === "admin"
              ? [{ href: "/admin", label: "Admin Dashboard",  icon: "⚙️" }]
              : []
            ),
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", textDecoration: "none",
                color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-subtle)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              {item.label}
            </a>
          ))}

          {!authenticated && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)" }}>
              {authError && (
                <p style={{ marginBottom: 8, fontSize: 11, color: "var(--coral)", lineHeight: 1.4 }}>
                  {authError}
                </p>
              )}
              <button
                onClick={async () => {
                  const ok = await authenticate();
                  if (ok) {
                    toast({ title: "Wallet authenticated", description: "Signature verified successfully.", variant: "success" });
                    setMenuOpen(false);
                  }
                }}
                disabled={authenticating}
                style={{
                  width: "100%",
                  textAlign: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  cursor: authenticating ? "not-allowed" : "pointer",
                  background: "var(--bg-subtle)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 600,
                  opacity: authenticating ? 0.7 : 1,
                }}
              >
                {authenticating ? "Awaiting signature..." : "Authenticate Wallet"}
              </button>
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => {
                disconnect();
                setAuthOnConnectRequested(false);
                setMenuOpen(false);
                fetch("/api/wallet/session", { method: "DELETE" }).catch(() => {});
              }}
              style={{
                width: "100%", textAlign: "left", display: "flex",
                alignItems: "center", gap: 10, padding: "10px 16px",
                background: "none", border: "none", cursor: "pointer",
                color: "#dc2626", fontSize: 13, fontWeight: 500,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fee2e2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              🔌 Disconnect Wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
