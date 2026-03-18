"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, Shield, ExternalLink, LogOut, ChevronRight } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Card, Badge, Button } from "@/components/ui";
import CertificateDisplay from "@/components/certificates/CertificateDisplay";
import type { Certificate, Issuer } from "@/types";
import { useWalletSession } from "@/lib/wallet/context";
import { sameSuiAddress } from "@/lib/wallet/address";
import { useToast } from "@/components/ui/ToastProvider";
import { signOut as clientSignOut } from "next-auth/react";

interface ProfileData {
  authenticated: boolean;
  user?: { email: string; name: string; image?: string };
  issuer?: Issuer | null;
}

export default function ProfilePage() {
  const { session, connected, authenticated, authenticating, authenticate } = useWalletSession();
  const { toast } = useToast();
  const [profile, setProfile]   = useState<ProfileData | null>(null);
  const [certs, setCerts]       = useState<Certificate[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"certs" | "issuer">("certs");
  const [zkloginAddress, setZkloginAddress] = useState<string | null>(null);
  const [walletBoundAddress, setWalletBoundAddress] = useState<string | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [bindingWallet, setBindingWallet] = useState(false);

  useEffect(() => {
    // Load user's issuer profile (also tells us if they're logged in)
    fetch("/api/issuers/me")
      .then((r) => r.json())
      .then((data: ProfileData) => {
        setProfile(data);
        if (!data.authenticated) {
          window.location.href = "/auth/signin?callbackUrl=/profile";
        }
      })
      .catch(() => setLoading(false))
      .finally(() => setLoading(false));

    // Load their certificates
    fetch("/api/certificates")
      .then((r) => r.json())
      .then(setCerts)
      .catch(() => setCerts([]));

    Promise.all([
      fetch("/api/auth/zklogin/verify").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/auth/wallet/bind").then((r) => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([zkRes, bindRes]) => {
        const identity = zkRes?.identity as { zkloginAddress?: string | null } | undefined;
        setZkloginAddress(identity?.zkloginAddress ?? null);
        setWalletBoundAddress((bindRes?.walletBoundAddress as string | null | undefined) ?? null);
      })
      .finally(() => setIdentityLoading(false));
  }, []);

  async function bindWalletToAccount() {
    setBindingWallet(true);
    try {
      if (!connected) {
        toast({
          title: "Wallet connection required",
          description: "Connect your wallet from the navbar first.",
          variant: "warning",
        });
        return;
      }

      if (!authenticated) {
        toast({
          title: "Wallet authentication required",
          description: "Authenticate wallet first, then bind.",
          variant: "warning",
        });
        return;
      }

      const res = await fetch("/api/auth/wallet/bind", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Wallet bind failed");
      setWalletBoundAddress((data?.walletBoundAddress as string | null | undefined) ?? null);
      toast({
        title: "Wallet bound",
        description: "Wallet is now linked to your account.",
        variant: "success",
      });
    } catch (err: unknown) {
      toast({
        title: "Wallet bind failed",
        description: err instanceof Error ? err.message : "Failed to bind wallet",
        variant: "error",
      });
    } finally {
      setBindingWallet(false);
    }
  }

  async function authenticateWallet() {
    if (!connected) {
      toast({
        title: "Wallet connection required",
        description: "Connect your wallet from the navbar first.",
        variant: "warning",
      });
      return;
    }

    if (authenticated) {
      toast({
        title: "Wallet already authenticated",
        description: "You can bind this wallet to your account now.",
        variant: "info",
      });
      return;
    }

    const ok = await authenticate();
    if (ok) {
      toast({
        title: "Wallet authenticated",
        description: "Signature verified. You can now bind your wallet.",
        variant: "success",
      });
      return;
    }

    toast({
      title: "Wallet authentication required",
      description: "Please sign the wallet challenge to continue.",
      variant: "warning",
    });
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <Navbar />
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "80px 24px", textAlign: "center", color: "var(--text-muted)" }}>
          Loading your profile...
        </div>
      </div>
    );
  }

  if (!profile?.authenticated) return null; // Redirect handled above

  const user = profile.user!;
  const currentWalletAddress = session?.address ?? null;
  const walletBindMismatch = Boolean(
    connected && currentWalletAddress && walletBoundAddress && !sameSuiAddress(walletBoundAddress, currentWalletAddress)
  );
  const boundToCurrentWallet = Boolean(
    walletBoundAddress && (!connected || !currentWalletAddress || sameSuiAddress(walletBoundAddress, currentWalletAddress))
  );
  const maskedBoundAddress = walletBoundAddress
    ? `${walletBoundAddress.slice(0, 6)}...${walletBoundAddress.slice(-4)}`
    : null;
  const maskedConnectedAddress = currentWalletAddress
    ? `${currentWalletAddress.slice(0, 6)}...${currentWalletAddress.slice(-4)}`
    : null;
  const identityReadyCount = [true, Boolean(zkloginAddress), Boolean(connected), Boolean(connected && authenticated), Boolean(boundToCurrentWallet)].filter(Boolean).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>

        {/* Profile header */}
        <Card style={{ padding: "32px", marginBottom: 24, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt={user.name} width={72} height={72} style={{ borderRadius: "50%", border: "3px solid var(--border)" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, var(--sui-blue), var(--sui-teal))", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, color: "white" }}>
              {user.name?.charAt(0) ?? user.email.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{user.name}</h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 10 }}>{user.email}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {profile.issuer?.status === "approved" && <Badge variant="success" dot>Verified Issuer</Badge>}
              {profile.issuer?.status === "pending"  && <Badge variant="warning" dot>Issuer Pending</Badge>}
              {!profile.issuer && <Badge variant="default">User</Badge>}
              <Badge variant="sui">Sui Testnet</Badge>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!profile.issuer && (
              <Link href="/issuer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "linear-gradient(135deg, #4DA2FF, #097EED)", color: "white", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>
                <Shield size={13} /> Become an Issuer
              </Link>
            )}
            <a href="/" onClick={(e) => { e.preventDefault(); void clientSignOut({ callbackUrl: "/" }); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1.5px solid var(--border)", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>
              <LogOut size={13} /> Sign out
            </a>
          </div>
        </Card>

        {/* Quick links */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 32 }}>
          {[
            { href: "/dashboard", icon: <Award size={18} />, label: "Browse Events", desc: "Find certification seminars", color: "var(--accent)" },
            { href: "/profiles", icon: <ExternalLink size={18} />, label: "Public Profiles", desc: "Visit other verified profiles", color: "var(--sui-blue)" },
            { href: "/issuer",    icon: <Shield size={18} />, label: profile.issuer ? "Issuer Portal" : "Become an Issuer", desc: profile.issuer ? "Manage your events" : "Apply as an issuer", color: "var(--mint)" },
            { href: "/verify/demo", icon: <ExternalLink size={18} />, label: "Verify Certificate", desc: "Check any certificate QR", color: "var(--gold)" },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              <Card hover style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "var(--radius-sm)", background: `${item.color}14`, display: "flex", alignItems: "center", justifyContent: "center", color: item.color, flexShrink: 0 }}>
                  {item.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>{item.label}</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.desc}</p>
                </div>
                <ChevronRight size={14} color="var(--text-muted)" />
              </Card>
            </Link>
          ))}
        </div>

        <Card style={{ padding: "22px", marginBottom: 24, background: "linear-gradient(180deg, rgba(77,162,255,0.05) 0%, var(--bg-card) 45%)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, margin: 0 }}>Identity Upgrade</h3>
            <Badge variant={identityReadyCount === 5 ? "success" : "info"}>
              {identityReadyCount}/5 steps complete
            </Badge>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 14 }}>
            Base privilege is view-only with Google login. Complete all identity steps to unlock issuer onboarding.
          </p>
          <div style={{ width: "100%", height: 7, background: "var(--bg-subtle)", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ width: `${(identityReadyCount / 5) * 100}%`, height: "100%", background: "linear-gradient(90deg, #4DA2FF, #97EFE9)", transition: "width 220ms ease" }} />
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              { label: "Google connected", status: "Connected", ok: true },
              { label: "zkLogin verified", status: identityLoading ? "Checking..." : zkloginAddress ? "Verified" : "Required", ok: Boolean(zkloginAddress) && !identityLoading },
              { label: "Wallet connected", status: connected ? "Connected" : "Required", ok: connected },
              { label: "Wallet authenticated", status: connected && authenticated ? "Verified" : "Required", ok: connected && authenticated },
              {
                label: "Wallet bound",
                status: identityLoading ? "Checking..." : walletBindMismatch ? "Different wallet" : boundToCurrentWallet ? "Bound" : "Required for issuer",
                ok: boundToCurrentWallet && !identityLoading,
              },
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-card)" }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 600 }}>{item.label}</span>
                {item.status === "Checking..."
                  ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Checking...</span>
                  : <Badge variant={item.ok ? "success" : "warning"} dot>{item.status}</Badge>}
              </div>
            ))}
            {!identityLoading && !zkloginAddress && (
              <Button variant="secondary" size="sm" onClick={() => { window.location.href = "/auth/zklogin?callbackUrl=/profile"; }} style={{ width: "fit-content" }}>
                Verify zkLogin
              </Button>
            )}
            {!identityLoading && !boundToCurrentWallet && connected && !authenticated && (
              <Button variant="secondary" size="sm" loading={authenticating} onClick={authenticateWallet} style={{ width: "fit-content" }}>
                Authenticate wallet
              </Button>
            )}
            {!identityLoading && !boundToCurrentWallet && connected && authenticated && (
              <Button variant="secondary" size="sm" loading={bindingWallet} onClick={bindWalletToAccount} style={{ width: "fit-content" }}>
                Bind current wallet
              </Button>
            )}
            {!identityLoading && !boundToCurrentWallet && !connected && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Connect a wallet from the navbar to continue.
              </p>
            )}
            {!identityLoading && walletBindMismatch && (
              <div style={{ border: "1px solid #fde68a", background: "var(--gold-subtle)", borderRadius: "var(--radius-sm)", padding: "10px 12px" }}>
                <p style={{ fontSize: 12, color: "var(--gold)", margin: 0, fontWeight: 700 }}>
                  Bound wallet and connected wallet are different.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <div style={{ border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 10px", background: "#fff8dc" }}>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Bound</p>
                    <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", margin: "4px 0 0", color: "var(--text-primary)" }}>{maskedBoundAddress ?? "Unknown"}</p>
                  </div>
                  <div style={{ border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 10px", background: "#fff8dc" }}>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Connected</p>
                    <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", margin: "4px 0 0", color: "var(--text-primary)" }}>{maskedConnectedAddress ?? "Unknown"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-subtle)", borderRadius: "var(--radius)", padding: 4, marginBottom: 24, width: "fit-content" }}>
          {[
            { id: "certs",  label: `My Certificates (${certs.length})` },
            { id: "issuer", label: "Issuer Status" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id as "certs" | "issuer")} style={{
              padding: "8px 18px", borderRadius: "var(--radius-sm)", border: "none",
              background: tab === t.id ? "var(--bg-card)" : "transparent",
              color: tab === t.id ? "var(--text-primary)" : "var(--text-muted)",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
              cursor: "pointer", boxShadow: tab === t.id ? "var(--shadow-sm)" : "none",
            }}>{t.label}</button>
          ))}
        </div>

        {/* Certificates tab */}
        {tab === "certs" && (
          <div style={{ animation: "fadeUp 0.4s ease-out" }}>
            {certs.length === 0 ? (
              <Card style={{ padding: "48px", textAlign: "center" }}>
                <Award size={36} style={{ margin: "0 auto 16px", color: "var(--text-muted)" }} />
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No certificates yet</h3>
                <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
                  Attend a certified event and complete the required time to earn your first Soulbound Token certificate.
                </p>
                <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: "var(--radius-sm)", background: "var(--text-primary)", color: "white", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>
                  Browse Events <ChevronRight size={14} />
                </Link>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {certs.map((cert) => (
                  <div key={cert.id}>
                    <CertificateDisplay certificate={cert} compact />
                    <div style={{ marginTop: 6, marginLeft: 4 }}>
                      <Link href={`/claim/${cert.id}`} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
                        View full certificate →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Issuer status tab */}
        {tab === "issuer" && (
          <div style={{ animation: "fadeUp 0.4s ease-out" }}>
            {!profile.issuer ? (
              <Card style={{ padding: "40px", textAlign: "center" }}>
                <Shield size={36} style={{ margin: "0 auto 16px", color: "var(--text-muted)" }} />
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Not an issuer yet</h3>
                <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
                  Apply to become a certified issuer and start creating events with blockchain-verified certificates.
                </p>
                <Link href="/issuer?tab=apply" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: "var(--radius-sm)", background: "linear-gradient(135deg, #4DA2FF, #097EED)", color: "white", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>
                  <Shield size={14} /> Apply as Issuer
                </Link>
              </Card>
            ) : (
              <Card style={{ padding: "28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, var(--sui-blue), var(--sui-teal))", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "white" }}>
                    {profile.issuer.name.charAt(0)}
                  </div>
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{profile.issuer.name}</p>
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{profile.issuer.organization}</p>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <Badge variant={profile.issuer.status === "approved" ? "success" : profile.issuer.status === "pending" ? "warning" : "danger"} dot>
                      {profile.issuer.status}
                    </Badge>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "14px" }}>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", marginBottom: 4 }}>AI Trust Score</p>
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: (profile.issuer.aiScore ?? 0) >= 80 ? "var(--mint)" : "var(--gold)" }}>
                      {profile.issuer.aiScore ?? "—"}<span style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 400 }}>/100</span>
                    </p>
                  </div>
                  <div style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "14px" }}>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", marginBottom: 4 }}>Subscription</p>
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: profile.issuer.subscriptionActive ? "var(--mint)" : "var(--coral)" }}>
                      {profile.issuer.subscriptionActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
                {profile.issuer.aiSummary && (
                  <div style={{ padding: "12px 14px", background: "var(--accent-subtle)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, borderLeft: "3px solid var(--accent)" }}>
                    {profile.issuer.aiSummary}
                  </div>
                )}
                {profile.issuer.status === "approved" && (
                  <div style={{ marginTop: 16 }}>
                    <Link href="/issuer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--text-primary)", color: "white", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>
                      Go to Issuer Portal <ChevronRight size={13} />
                    </Link>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
