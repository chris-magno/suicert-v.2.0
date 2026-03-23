"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, Shield, ExternalLink, LogOut, ChevronRight } from "lucide-react";
import { useSignPersonalMessage } from "@mysten/dapp-kit";
import Navbar from "@/components/layout/Navbar";
import { Card, Badge, Button } from "@/components/ui";
import CertificateDisplay from "@/components/certificates/CertificateDisplay";
import type { Certificate, Issuer } from "@/types";
import { useWalletSession } from "@/lib/wallet/context";
import { sameSuiAddress } from "@/lib/wallet/address";
import { useToast } from "@/components/ui/ToastProvider";
import IdentityHierarchyPanel from "@/components/auth/IdentityHierarchyPanel";
import { useIdentityStatus } from "@/lib/auth/use-identity-status";
import { performFullLogout } from "@/lib/auth/client-logout";

interface ProfileData {
  authenticated: boolean;
  role?: "admin" | "issuer" | "user" | "guest";
  user?: { email: string; name: string; image?: string };
  issuer?: Issuer | null;
}

export default function ProfilePage() {
  const { session, connected } = useWalletSession();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { toast } = useToast();
  const [profile, setProfile]   = useState<ProfileData | null>(null);
  const [certs, setCerts]       = useState<Certificate[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"certs" | "issuer">("certs");
  const [bindingWallet, setBindingWallet] = useState(false);
  const [verifyingSignature, setVerifyingSignature] = useState(false);
  const {
    loading: identityLoading,
    zkloginAddress,
    walletBoundAddress,
    walletSignatureVerified,
    walletSessionAgeSeconds,
    walletActionMaxAgeSeconds,
    gates,
    registration,
    refresh: refreshIdentity,
  } = useIdentityStatus();

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

  }, []);

  async function bindWalletToAccount() {
    setBindingWallet(true);
    try {
      if (!connected || !currentWalletAddress) {
        toast({
          title: "Wallet connection required",
          description: "Connect your wallet from the navbar first.",
          variant: "warning",
        });
        return;
      }

      const res = await fetch("/api/auth/wallet/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: currentWalletAddress }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Wallet bind failed");
      await refreshIdentity();
      toast({
        title: "Wallet bound",
        description: `Sui address linked: ${currentWalletAddress}`,
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

  async function skipWalletBinding() {
    setBindingWallet(true);
    try {
      const res = await fetch("/api/auth/wallet/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Unable to skip wallet binding");

      await refreshIdentity();
      toast({
        title: "Wallet skipped",
        description: "You can bind a wallet later from profile settings.",
        variant: "info",
      });
    } catch (err: unknown) {
      toast({
        title: "Unable to skip wallet",
        description: err instanceof Error ? err.message : "Skip failed",
        variant: "error",
      });
    } finally {
      setBindingWallet(false);
    }
  }

  async function authenticateWallet() {
    if (!connected || !currentWalletAddress) {
      toast({
        title: "Wallet connection required",
        description: "Connect your wallet from the navbar first.",
        variant: "warning",
      });
      return;
    }

    if (!zkloginAddress || !walletBoundAddress) {
      toast({
        title: "Wallet bind required",
        description: "Bind your wallet first before signature verification.",
        variant: "warning",
      });
      return;
    }

    if (walletSignatureVerified) {
      toast({
        title: "Already verified",
        description: "Wallet signature is already verified for this account.",
        variant: "info",
      });
      return;
    }

    const timestamp = new Date().toISOString();
    const message = [
      "SUICERT Wallet Bind Verification",
      `ZK Address: ${zkloginAddress}`,
      `Wallet Address: ${walletBoundAddress}`,
      `Timestamp: ${timestamp}`,
    ].join("\n");

    setVerifyingSignature(true);
    try {
      const signed = await signPersonalMessage({
        message: new TextEncoder().encode(message),
      });

      const signature = (signed as { signature?: string; signatureSerialized?: string }).signatureSerialized
        ?? (signed as { signature?: string }).signature;
      if (!signature) throw new Error("Wallet returned an invalid signature payload.");

      const verifyRes = await fetch("/api/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          signature,
          walletAddress: walletBoundAddress,
          zkAddress: zkloginAddress,
        }),
      });

      const verifyBody = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        throw new Error(verifyBody?.error ?? "Wallet signature verification failed");
      }

      await refreshIdentity();
      toast({
        title: "Wallet verified",
        description: "Wallet signature has been verified and linked.",
        variant: "success",
      });
    } catch (err: unknown) {
      toast({
        title: "Signature verification failed",
        description: err instanceof Error ? err.message : "Please try signing again.",
        variant: "error",
      });
    } finally {
      setVerifyingSignature(false);
    }
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

  const userName = profile.user?.name?.trim() || "User";
  const userEmail = profile.user?.email?.trim() || "";
  const userImage = profile.user?.image;
  const userInitial = (userName.charAt(0) || userEmail.charAt(0) || "U").toUpperCase();
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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>

        {/* Profile header */}
        <Card style={{ padding: "32px", marginBottom: 24, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt={userName} width={72} height={72} style={{ borderRadius: "50%", border: "3px solid var(--border)" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, var(--sui-blue), var(--sui-teal))", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, color: "white" }}>
              {userInitial}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 4 }}>{userName}</h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 10 }}>{userEmail || "No email"}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {profile.role === "admin" && <Badge variant="danger" dot>Admin</Badge>}
              {profile.role === "issuer" && !profile.issuer && <Badge variant="info" dot>Issuer</Badge>}
              {profile.issuer?.status === "approved" && <Badge variant="success" dot>Verified Issuer</Badge>}
              {profile.issuer?.status === "pending"  && <Badge variant="warning" dot>Issuer Pending</Badge>}
              {!profile.issuer && profile.role !== "admin" && <Badge variant="default">User</Badge>}
              <Badge variant="sui">Sui Testnet</Badge>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!profile.issuer && (
              <Link href="/issuer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "linear-gradient(135deg, #4DA2FF, #097EED)", color: "white", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>
                <Shield size={13} /> Become an Issuer
              </Link>
            )}
            <a href="/" onClick={(e) => { e.preventDefault(); void performFullLogout("/"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: "var(--radius-sm)", background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1.5px solid var(--border)", textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>
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

        <IdentityHierarchyPanel
          title="Identity & Authorization Gates"
          subtitle="SuiCert writes are unlocked only when L1-L4 pass in order: zkLogin identity, wallet match, fresh signature, then execution."
          callbackUrl="/profile"
          loading={identityLoading}
          zkloginAddress={zkloginAddress}
          walletBoundAddress={walletBoundAddress}
          currentWalletAddress={currentWalletAddress}
          connected={connected}
          authenticated={walletSignatureVerified}
          authenticating={verifyingSignature}
          bindingWallet={bindingWallet}
          walletBindMismatch={walletBindMismatch}
          boundToCurrentWallet={boundToCurrentWallet}
          signatureFresh={gates.l3SignatureFresh}
          walletSessionAgeSeconds={walletSessionAgeSeconds}
          walletActionMaxAgeSeconds={walletActionMaxAgeSeconds}
          registrationState={registration.state}
          registrationNextRoute={registration.nextRoute}
          registrationIssuerStatus={registration.issuerStatus}
          onVerifyZklogin={() => { window.location.href = "/auth/zklogin?callbackUrl=/profile"; }}
          onAuthenticateWallet={authenticateWallet}
          onBindWallet={bindWalletToAccount}
          onSkipWallet={skipWalletBinding}
        />

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
