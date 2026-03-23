"use client";

import { useState } from "react";
import { ConnectModal, useWallets } from "@mysten/dapp-kit";
import { Button, Card, Badge } from "@/components/ui";

interface IdentityHierarchyPanelProps {
  title: string;
  subtitle: string;
  callbackUrl: string;
  loading: boolean;
  zkloginAddress: string | null;
  walletBoundAddress: string | null;
  currentWalletAddress: string | null;
  connected: boolean;
  authenticated: boolean;
  authenticating: boolean;
  bindingWallet: boolean;
  walletBindMismatch: boolean;
  boundToCurrentWallet: boolean;
  signatureFresh: boolean;
  walletSessionAgeSeconds: number | null;
  walletActionMaxAgeSeconds: number;
  registrationState: "new" | "returning";
  registrationNextRoute: string;
  registrationIssuerStatus: string | null;
  onVerifyZklogin: () => void;
  onAuthenticateWallet: () => void;
  onBindWallet: () => void;
  onSkipWallet?: () => void;
}

export default function IdentityHierarchyPanel(props: IdentityHierarchyPanelProps) {
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const wallets = useWallets();
  const hasWalletProviders = wallets.length > 0;

  const {
    title,
    subtitle,
    callbackUrl,
    loading,
    zkloginAddress,
    walletBoundAddress,
    currentWalletAddress,
    connected,
    authenticated,
    authenticating,
    bindingWallet,
    walletBindMismatch,
    boundToCurrentWallet,
    signatureFresh,
    walletSessionAgeSeconds,
    walletActionMaxAgeSeconds,
    registrationState,
    registrationNextRoute,
    registrationIssuerStatus,
    onVerifyZklogin,
    onAuthenticateWallet,
    onBindWallet,
    onSkipWallet,
  } = props;

  const l1 = Boolean(zkloginAddress);
  const l2 = Boolean(boundToCurrentWallet);
  const l3 = Boolean(l2 && signatureFresh);
  const l4 = Boolean(l1 && l2 && l3);

  const percent = [l1, l2, l3, l4].filter(Boolean).length / 4 * 100;

  const masked = (value: string | null) => value
    ? `${value.slice(0, 6)}...${value.slice(-4)}`
    : "Unknown";

  return (
    <Card style={{ padding: 22, marginBottom: 20, background: "linear-gradient(180deg, rgba(77,162,255,0.05) 0%, var(--bg-card) 45%)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, margin: 0 }}>{title}</h3>
        <Badge variant={l4 ? "success" : "info"}>{Math.round(percent / 25)}/4 gates</Badge>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 14 }}>{subtitle}</p>

      <div style={{ width: "100%", height: 7, background: "var(--bg-subtle)", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ width: `${percent}%`, height: "100%", background: "linear-gradient(90deg, #4DA2FF, #97EFE9)", transition: "width 220ms ease" }} />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {[
          {
            key: "L1",
            label: "L1 Identity Gate",
            description: "zkLogin identity derived from Google OAuth",
            status: loading ? "Checking..." : l1 ? "Verified" : "Required",
            ok: l1,
          },
          {
            key: "L2",
            label: "L2 Authorization Gate",
            description: "Bind a wallet address to your zkLogin identity (or skip)",
            status: loading
              ? "Checking..."
              : walletBindMismatch
                ? "Different wallet"
                : l2
                  ? "Matched"
                  : "Required",
            ok: l2,
          },
          {
            key: "L3",
            label: "L3 Action Gate",
            description: "Verify ownership by signing canonical zk+wallet message",
            status: loading
              ? "Checking..."
              : l3
                ? "Authorized"
                : "Required",
            ok: l3,
          },
          {
            key: "L4",
            label: "L4 Execution Gate",
            description: "On-chain SuiCert actions unlocked",
            status: loading ? "Checking..." : l4 ? "Write enabled" : "Blocked",
            ok: l4,
          },
        ].map((item) => (
          <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", flexWrap: "wrap" }}>
            <div style={{ minWidth: 240, flex: 1 }}>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 700, margin: 0 }}>{item.label}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "3px 0 0" }}>{item.description}</p>
              {!loading && item.key === "L1" && zkloginAddress && (
                <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "6px 0 0", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                  zkLogin: {zkloginAddress}
                </p>
              )}
              {!loading && item.key === "L2" && currentWalletAddress && (
                <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "6px 0 0", fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>
                  Selected Sui wallet: {currentWalletAddress}
                </p>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {item.status === "Checking..."
                ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Checking...</span>
                : <Badge variant={item.ok ? "success" : "warning"} dot>{item.status}</Badge>}

              {!loading && item.key === "L1" && !l1 && (
                <Button variant="secondary" size="sm" onClick={onVerifyZklogin}>
                  Connect zkLogin
                </Button>
              )}

              {!loading && item.key === "L2" && !l2 && !connected && (
                <ConnectModal
                  open={bindModalOpen}
                  onOpenChange={setBindModalOpen}
                  trigger={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setBindModalOpen(true);
                      }}
                    >
                      Choose Wallet (Slush Popup)
                    </Button>
                  }
                />
              )}

              {!loading && item.key === "L2" && !l2 && connected && (
                <Button variant="secondary" size="sm" loading={bindingWallet} onClick={onBindWallet}>
                  Bind Selected Sui Address
                </Button>
              )}

              {!loading && item.key === "L2" && !l2 && onSkipWallet && (
                <Button variant="ghost" size="sm" onClick={onSkipWallet}>
                  Skip for now
                </Button>
              )}

              {!loading && item.key === "L3" && !l3 && (
                <Button variant="secondary" size="sm" loading={authenticating} onClick={onAuthenticateWallet}>
                  Verify Signature
                </Button>
              )}
            </div>
          </div>
        ))}

        {!loading && l1 && !l2 && !connected && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Wallet is required for authorization. Use "Connect Wallet" in L2 to choose a provider (for example Slush Wallet, Suiet, or Ethos).
          </p>
        )}

        {!loading && l1 && !l2 && !connected && !hasWalletProviders && (
          <p style={{ fontSize: 11, color: "#b45309", margin: 0 }}>
            No Sui wallet provider detected. Install Slush Wallet, Suiet, or Ethos, then click Bind Wallet again.
          </p>
        )}

        {!loading && walletBindMismatch && (
          <div style={{ border: "1px solid #fde68a", background: "var(--gold-subtle)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
            <p style={{ fontSize: 11, color: "var(--gold)", margin: 0, fontWeight: 700 }}>
              Connected wallet does not match bound identity.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <div style={{ border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 10px", background: "#fff8dc" }}>
                <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Bound</p>
                <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", margin: "4px 0 0", color: "var(--text-primary)" }}>{masked(walletBoundAddress)}</p>
              </div>
              <div style={{ border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 10px", background: "#fff8dc" }}>
                <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Connected</p>
                <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", margin: "4px 0 0", color: "var(--text-primary)" }}>{masked(currentWalletAddress)}</p>
              </div>
            </div>
          </div>
        )}

        {!loading && l2 && !l3 && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Signature freshness exceeded {walletActionMaxAgeSeconds}s. Re-authenticate wallet before write actions.
          </p>
        )}

        {!loading && l3 && walletSessionAgeSeconds !== null && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
            Signature age: {walletSessionAgeSeconds}s / {walletActionMaxAgeSeconds}s window.
          </p>
        )}

        {!loading && l3 && (
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", background: "var(--bg-subtle)" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", margin: 0 }}>
              Registration Guard
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 10px" }}>
              {registrationState === "new"
                ? "New user detected: create on-chain/app profile before issuer actions."
                : "Returning user detected: resume with existing profile and status."}
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <Badge variant={registrationState === "new" ? "warning" : "success"} dot>
                {registrationState === "new" ? "New user -> Register" : "Returning -> Resume"}
              </Badge>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { window.location.href = registrationNextRoute; }}
              >
                {registrationState === "new" ? "Continue to Registration" : "Resume Profile"}
              </Button>
            </div>
            {registrationIssuerStatus && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
                Current issuer status: {registrationIssuerStatus}
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
