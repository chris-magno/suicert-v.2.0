"use client";
import { useState, useEffect } from "react";
import { Shield, CheckCircle2, Clock, AlertCircle, Plus, Award, Zap } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Button, Card, Input, Textarea, Badge } from "@/components/ui";
import type { IssuerVerificationResult } from "@/lib/ai";
import EventCard from "@/components/events/EventCard";
import type { CertEvent, Issuer } from "@/types";
import { useWalletSession } from "@/lib/wallet/context";
import { useToast } from "@/components/ui/ToastProvider";

type Tab = "overview" | "apply" | "events" | "create";

export default function IssuerPage() {
  const { authenticated, authenticating, authenticate } = useWalletSession();
  const { toast } = useToast();
  const [tab, setTab]               = useState<Tab>("overview");
  const [form, setForm]             = useState({ name: "", organization: "", email: "", website: "", description: "" });
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [aiResult, setAiResult]     = useState<IssuerVerificationResult | null>(null);
  const [submitted, setSubmitted]   = useState(false);
  const [myIssuer, setMyIssuer]     = useState<Issuer | null>(null);
  const [myEvents, setMyEvents]     = useState<CertEvent[]>([]);
  const [loadingIssuer, setLoadingIssuer] = useState(true);
  const [proofTxDigest, setProofTxDigest] = useState("");
  const [proofCapId, setProofCapId] = useState("");
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [zkloginAddress, setZkloginAddress] = useState<string | null>(null);
  const [walletBoundAddress, setWalletBoundAddress] = useState<string | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [bindingWallet, setBindingWallet] = useState(false);

  // Load current user's issuer profile and events
  useEffect(() => {
    fetch("/api/issuers/me")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.issuer) {
          setMyIssuer(data.issuer);
          // Load their events
          fetch(`/api/events?issuerId=${data.issuer.id}`)
            .then((r) => r.json())
            .then(setMyEvents)
            .catch(() => setMyEvents([]));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingIssuer(false));
  }, []);

  useEffect(() => {
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

  async function handleApply() {
    if (!zkloginAddress) {
      toast({
        title: "zkLogin verification required",
        description: "Complete zkLogin verification first.",
        variant: "warning",
      });
      return;
    }

    if (!walletBoundAddress) {
      toast({
        title: "Wallet bind required",
        description: "Bind your authenticated wallet before applying as issuer.",
        variant: "warning",
      });
      return;
    }

    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = "Name is required";
    if (!form.organization.trim()) newErrors.organization = "Organization is required";
    if (!form.email.trim()) newErrors.email = "Email is required";
    if (form.description.length < 50) newErrors.description = "Please provide at least 50 characters";
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setSubmitting(true);
    setErrors({});
    try {
      // POST to API — saves to database, NOT just in-memory
      const res = await fetch("/api/issuers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setAiResult(data.aiResult);
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      toast({
        title: "Issuer application failed",
        description: msg,
        variant: "error",
        durationMs: 4200,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function bindWalletToAccount() {
    setBindingWallet(true);
    try {
      if (!authenticated) {
        const ok = await authenticate();
        if (!ok) {
          toast({
            title: "Wallet authentication required",
            description: "Please sign the wallet challenge first.",
            variant: "warning",
          });
          return;
        }
      }

      const res = await fetch("/api/auth/wallet/bind", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Wallet bind failed");

      setWalletBoundAddress((data?.walletBoundAddress as string | null | undefined) ?? null);
      toast({
        title: "Wallet bound",
        description: "Wallet successfully linked to your account.",
        variant: "success",
      });
    } catch (err: unknown) {
      toast({
        title: "Wallet bind failed",
        description: err instanceof Error ? err.message : "Unable to bind wallet",
        variant: "error",
      });
    } finally {
      setBindingWallet(false);
    }
  }

  async function submitOnChainProof() {
    if (!authenticated) {
      toast({
        title: "Wallet authentication required",
        description: "Authenticate your wallet first before submitting on-chain proof.",
        variant: "warning",
      });
      return;
    }

    if (!proofTxDigest.trim() || !proofCapId.trim()) {
      toast({
        title: "Missing proof details",
        description: "Transaction digest and issuer cap/object id are required.",
        variant: "warning",
      });
      return;
    }

    setProofSubmitting(true);
    try {
      const res = await fetch("/api/issuers/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txDigest: proofTxDigest.trim(), issuerCapId: proofCapId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Proof submission failed");

      setMyIssuer((prev) => prev ? ({
        ...prev,
        status: "approved",
        issuerCapId: data.issuerCapId,
        registrationTxDigest: data.registrationTxDigest,
        onchainRegisteredAt: data.onchainRegisteredAt,
        verifiedAt: data.onchainRegisteredAt,
      }) : prev);
      toast({
        title: "On-chain proof submitted",
        description: "Your issuer account is now fully approved.",
        variant: "success",
      });
      setProofTxDigest("");
      setProofCapId("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Proof submission failed";
      toast({
        title: "Proof submission failed",
        description: msg,
        variant: "error",
        durationMs: 4200,
      });
    } finally {
      setProofSubmitting(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "apply",    label: myIssuer ? "My Application" : "Apply as Issuer" },
    { id: "events",   label: "My Events" },
    { id: "create",   label: "Create Event" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 6 }}>Issuer Portal</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>Manage your certified events and track attendance in real-time.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-subtle)", borderRadius: "var(--radius)", padding: 4, marginBottom: 32, width: "fit-content" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "8px 18px", borderRadius: "var(--radius-sm)", border: "none",
              background: tab === t.id ? "var(--bg-card)" : "transparent",
              color: tab === t.id ? "var(--text-primary)" : "var(--text-muted)",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
              cursor: "pointer", boxShadow: tab === t.id ? "var(--shadow-sm)" : "none", transition: "all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div style={{ animation: "fadeUp 0.4s ease-out" }}>
            {loadingIssuer ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
            ) : myIssuer ? (
              <>
                {/* Issuer status card */}
                <Card style={{ padding: "24px", marginBottom: 24, borderLeft: `4px solid ${myIssuer.status === "approved" ? "var(--mint)" : myIssuer.status === "pending_onchain" ? "var(--accent)" : myIssuer.status === "pending" ? "var(--gold)" : "var(--coral)"}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, var(--sui-blue), var(--sui-teal))", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "white" }}>
                        {myIssuer.name.charAt(0)}
                      </div>
                      <div>
                        <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{myIssuer.name}</p>
                        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{myIssuer.organization}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Badge variant={myIssuer.status === "approved" ? "success" : myIssuer.status === "pending_onchain" ? "info" : myIssuer.status === "pending" ? "warning" : "danger"} dot>
                        {myIssuer.status === "approved" ? "Final Approved" : myIssuer.status === "pending_onchain" ? "Pending On-Chain" : myIssuer.status === "pending" ? "Pending Review" : "Rejected"}
                      </Badge>
                      {myIssuer.subscriptionActive && <Badge variant="info">Subscription Active</Badge>}
                    </div>
                  </div>
                  {myIssuer.status === "pending" && (
                    <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--gold-subtle)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--gold)" }}>
                      ⏳ Your application is under review. An admin will approve or reject it shortly. AI Score: <strong>{myIssuer.aiScore}/100</strong>
                    </div>
                  )}
                  {myIssuer.status === "pending_onchain" && (
                    <div style={{ marginTop: 16, padding: "14px", background: "#e0f2fe", border: "1px solid #7dd3fc", borderRadius: "var(--radius-sm)" }}>
                      <p style={{ fontSize: 13, color: "var(--accent-dark)", marginBottom: 10, fontWeight: 600 }}>
                        ✅ Admin approved step 1. Submit your issuer-signed on-chain registration proof to complete final approval.
                      </p>
                      {!authenticated && (
                        <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid #fecdd3", background: "var(--coral-subtle)", color: "var(--coral)", fontSize: 12, fontWeight: 600 }}>
                          Wallet is not authenticated. Signature verification is required before this transaction can proceed.
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                        <Input label="Registration Tx Digest" placeholder="Enter issuer-signed tx digest" value={proofTxDigest} onChange={(e) => setProofTxDigest(e.target.value)} />
                        <Input label="Issuer Cap / Object ID" placeholder="0x..." value={proofCapId} onChange={(e) => setProofCapId(e.target.value)} />
                        {!authenticated && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={authenticating}
                            onClick={() => {
                              void authenticate();
                            }}
                            style={{ width: "fit-content" }}
                          >
                            Authenticate Wallet
                          </Button>
                        )}
                        <Button variant="sui" size="sm" loading={proofSubmitting} disabled={!authenticated || authenticating} onClick={submitOnChainProof} style={{ width: "fit-content" }}>
                          {proofSubmitting ? "Submitting proof..." : !authenticated ? "Authenticate to Submit Proof" : "Submit On-Chain Proof"}
                        </Button>
                      </div>
                    </div>
                  )}
                  {myIssuer.status === "approved" && myIssuer.aiSummary && (
                    <div style={{ marginTop: 16, padding: "14px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, borderLeft: "3px solid var(--accent)" }}>
                      <strong style={{ color: "var(--accent-dark)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>AI Verification: </strong>
                      {myIssuer.aiSummary}
                    </div>
                  )}
                </Card>

                {/* Feature grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                  {[
                    { icon: <Zap size={18} />, title: "Real-time tracking", desc: "Live attendance via Google Meet webhooks + Ably", color: "var(--accent)" },
                    { icon: <Shield size={18} />, title: "AI verification", desc: "Claude Opus reviews issuer credentials in < 2 minutes", color: "var(--mint)" },
                    { icon: <Award size={18} />, title: "Sui SBTs", desc: "Non-transferable certificates minted automatically", color: "var(--gold)" },
                  ].map((f) => (
                    <div key={f.title} style={{ background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: "var(--radius)", padding: "20px" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${f.color}14`, display: "flex", alignItems: "center", justifyContent: "center", color: f.color, marginBottom: 10 }}>{f.icon}</div>
                      <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{f.title}</p>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{f.desc}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <Card style={{ padding: "40px", textAlign: "center" }}>
                <Shield size={40} style={{ margin: "0 auto 16px", color: "var(--text-muted)" }} />
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, marginBottom: 8 }}>You are not an issuer yet</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>Apply to become a certified issuer and start creating events with blockchain-verified certificates.</p>
                <Button variant="sui" size="lg" icon={<Plus size={16} />} onClick={() => setTab("apply")} style={{ justifyContent: "center" }}>
                  Apply as Issuer
                </Button>
              </Card>
            )}
          </div>
        )}

        {/* ── Apply ── */}
        {tab === "apply" && (
          <div style={{ maxWidth: 600, animation: "fadeUp 0.4s ease-out" }}>
            {myIssuer ? (
              <Card style={{ padding: "32px" }}>
                <div style={{ textAlign: "center" }}>
                  <CheckCircle2 size={40} color={myIssuer.status === "approved" ? "var(--mint)" : myIssuer.status === "pending_onchain" ? "var(--accent)" : "var(--gold)"} style={{ margin: "0 auto 16px" }} />
                  <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, marginBottom: 8 }}>
                    {myIssuer.status === "approved" ? "Final Approval Complete" : myIssuer.status === "pending_onchain" ? "Pending On-Chain Registration" : "Application Submitted"}
                  </h2>
                  <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>
                    {myIssuer.status === "approved"
                      ? "Your issuer account is active. You can now create events."
                      : myIssuer.status === "pending_onchain"
                        ? "Admin approved your application. Submit your signed on-chain registration proof in the Overview tab to finish approval."
                        : "Your application is under review. AI Score: " + myIssuer.aiScore + "/100"}
                  </p>
                  {myIssuer.status === "approved" && myIssuer.registrationTxDigest && (
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 }}>
                      On-chain tx digest: <span style={{ fontFamily: "var(--font-mono)" }}>{myIssuer.registrationTxDigest}</span>
                    </p>
                  )}
                  {myIssuer.status === "approved" && (
                    <Button variant="sui" onClick={() => setTab("create")} style={{ justifyContent: "center" }}>Create your first event</Button>
                  )}
                </div>
              </Card>
            ) : !submitted ? (
              <Card style={{ padding: "32px" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Issuer Application</h2>
                <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 28 }}>
                  Our AI will verify your credentials in under 2 minutes.
                </p>

                <div style={{ marginBottom: 20, padding: "14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-subtle)", display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>Google login</p>
                    <Badge variant="success" dot>Connected</Badge>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>zkLogin verification</p>
                    {identityLoading ? <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Checking...</span> : zkloginAddress ? <Badge variant="success" dot>Verified</Badge> : <Badge variant="warning" dot>Required</Badge>}
                  </div>
                  {!identityLoading && !zkloginAddress && (
                    <Button variant="secondary" size="sm" onClick={() => { window.location.href = "/auth/zklogin?callbackUrl=/issuer"; }} style={{ width: "fit-content" }}>
                      Verify zkLogin
                    </Button>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>Wallet bind</p>
                    {identityLoading ? <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Checking...</span> : walletBoundAddress ? <Badge variant="success" dot>Bound</Badge> : <Badge variant="warning" dot>Required</Badge>}
                  </div>
                  {!identityLoading && !walletBoundAddress && (
                    <Button variant="secondary" size="sm" loading={bindingWallet || authenticating} onClick={bindWalletToAccount} style={{ width: "fit-content" }}>
                      {authenticated ? "Bind current wallet" : "Authenticate and bind wallet"}
                    </Button>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <Input label="Full Name" placeholder="Dr. Maria Santos" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
                    <Input label="Organization" placeholder="Philippine Blockchain Institute" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} error={errors.organization} />
                  </div>
                  <Input label="Email" type="email" placeholder="maria@yourorg.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} hint="Use an organizational email for higher trust score" />
                  <Input label="Website (optional)" placeholder="https://yourorg.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                  <Textarea label="Organization Description" placeholder="Describe your organization and why you want to issue certificates (min. 50 characters)..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} error={errors.description} rows={5} />
                  <Button variant="sui" size="lg" loading={submitting} disabled={!zkloginAddress || !walletBoundAddress || identityLoading} onClick={handleApply} icon={<Shield size={16} />} style={{ width: "100%", justifyContent: "center" }}>
                    {submitting ? "Submitting & running AI check..." : "Submit Application"}
                  </Button>
                </div>
              </Card>
            ) : (
              <Card style={{ padding: "32px", animation: "scaleIn 0.4s ease-out" }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px", background: aiResult?.recommendation === "approve" ? "var(--mint-subtle)" : aiResult?.recommendation === "review" ? "var(--gold-subtle)" : "var(--coral-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {aiResult?.recommendation === "approve" ? <CheckCircle2 size={28} color="var(--mint)" /> : <Clock size={28} color="var(--gold)" />}
                  </div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>
                    {aiResult?.recommendation === "approve" ? "Application Submitted!" : "Under Review"}
                  </h2>
                  <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>{aiResult?.summary}</p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                    <div style={{ textAlign: "center", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "16px 24px" }}>
                      <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 32, color: (aiResult?.score ?? 0) >= 80 ? "var(--mint)" : (aiResult?.score ?? 0) >= 55 ? "var(--gold)" : "var(--coral)" }}>{aiResult?.score}</p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>AI TRUST SCORE</p>
                    </div>
                  </div>
                </div>
                {aiResult?.flags && aiResult.flags.length > 0 && (
                  <div style={{ background: "var(--gold-subtle)", border: "1px solid #fde68a", borderRadius: "var(--radius-sm)", padding: "12px 14px", marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--gold)", marginBottom: 6 }}>Flags detected:</p>
                    {aiResult.flags.map((f: string) => <p key={f} style={{ fontSize: 12, color: "var(--gold)" }}>• {f}</p>)}
                  </div>
                )}
                <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
                  ✅ Your application has been saved. An admin will review it shortly.
                </p>
              </Card>
            )}
          </div>
        )}

        {/* ── My Events ── */}
        {tab === "events" && (
          <div style={{ animation: "fadeUp 0.4s ease-out" }}>
            {!myIssuer || myIssuer.status !== "approved" ? (
              <Card style={{ padding: "40px", textAlign: "center" }}>
                <AlertCircle size={32} style={{ margin: "0 auto 12px", color: "var(--text-muted)" }} />
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Approved issuers only</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Your account must be approved before you can manage events.</p>
              </Card>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
                  <Button variant="sui" icon={<Plus size={14} />} onClick={() => setTab("create")}>New Event</Button>
                </div>
                {myEvents.length === 0 ? (
                  <Card style={{ padding: "48px", textAlign: "center" }}>
                    <Award size={36} style={{ margin: "0 auto 12px", color: "var(--text-muted)" }} />
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>No events yet</p>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Create your first certification event.</p>
                    <Button variant="sui" icon={<Plus size={14} />} onClick={() => setTab("create")}>Create Event</Button>
                  </Card>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
                    {myEvents.map((e) => <EventCard key={e.id} event={e} />)}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Create Event ── */}
        {tab === "create" && (
          <div style={{ maxWidth: 640, animation: "fadeUp 0.4s ease-out" }}>
            {!myIssuer || myIssuer.status !== "approved" ? (
              <Card style={{ padding: "40px", textAlign: "center" }}>
                <AlertCircle size={32} style={{ margin: "0 auto 12px", color: "var(--text-muted)" }} />
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>You must be an approved issuer to create events.</p>
              </Card>
            ) : (
              <Card style={{ padding: "32px" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Create Certification Event</h2>
                <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 28 }}>Set up a seminar with automated attendance tracking and instant SBT minting.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <Input label="Event Title" placeholder="Introduction to Sui Blockchain" />
                  <Textarea label="Description" placeholder="Describe what attendees will learn..." rows={4} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)" }}>Category</label>
                      <select className="input" style={{ cursor: "pointer" }}>
                        {["blockchain", "tech", "business", "education", "finance", "healthcare", "other"].map((c) => (
                          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <Input label="Required Minutes" type="number" placeholder="90" />
                  </div>
                  <Input label="Google Meet Link" placeholder="https://meet.google.com/abc-defg-hij" />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <Input label="Start Date & Time" type="datetime-local" />
                    <Input label="End Date & Time" type="datetime-local" />
                  </div>
                  <Input label="Tags (comma separated)" placeholder="blockchain, sui, web3" hint="Max 5 tags" />
                  <Button variant="sui" size="lg" icon={<Plus size={16} />} style={{ width: "100%", justifyContent: "center" }}>
                    Create Event
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
