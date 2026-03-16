"use client";
import { useState, useEffect, useCallback } from "react";
import { Shield, Award, Clock, CheckCircle2, XCircle, Eye, AlertTriangle, TrendingUp, Activity, RefreshCw } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Button, Card, Badge, StatCard } from "@/components/ui";
import type { IssuerVerificationResult } from "@/lib/ai";
import type { Issuer, CertEvent, AdminStats } from "@/types";
import { useToast } from "@/components/ui/ToastProvider";

type Tab = "overview" | "issuers" | "events" | "certificates";

export default function AdminPage() {
  const { toast } = useToast();
  const [tab, setTab]         = useState<Tab>("overview");
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [events, setEvents]   = useState<CertEvent[]>([]);
  const [stats, setStats]     = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing]   = useState<string | null>(null);
  const [aiResults, setAiResults]   = useState<Record<string, IssuerVerificationResult>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [issuersRes, eventsRes] = await Promise.all([
        fetch("/api/issuers"),
        fetch("/api/events"),
      ]);
      const issuersData: Issuer[]   = issuersRes.ok ? await issuersRes.json() : [];
      const eventsData: CertEvent[] = eventsRes.ok  ? await eventsRes.json()  : [];

      setIssuers(issuersData);
      setEvents(eventsData);

      // Build stats from real data
      setStats({
        totalIssuers:     issuersData.length,
        pendingIssuers:   issuersData.filter((i) => i.status === "pending" || i.status === "pending_onchain").length,
        totalEvents:      eventsData.length,
        totalCertificates: 0,
        mintedToday:      0,
        activeNow:        eventsData.filter((e) => e.status === "live").length,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function runAiCheck(issuer: Issuer) {
    setReviewing(issuer.id);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: issuer.name,
          organization: issuer.organization,
          email: issuer.email,
          website: issuer.website,
          description: issuer.description,
        }),
      });
      const result = await res.json();
      setAiResults((prev) => ({ ...prev, [issuer.id]: result }));
    } finally {
      setReviewing(null);
    }
  }

  async function updateIssuerStatus(id: string, status: "pending_onchain" | "rejected") {
    try {
      const res = await fetch("/api/issuers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast({
        title: status === "pending_onchain" ? "Issuer moved to pending on-chain" : "Issuer rejected",
        description: status === "pending_onchain" ? "Issuer must now submit on-chain proof." : "Issuer review status was updated.",
        variant: "success",
      });
      // Refresh from server
      await loadData();
    } catch {
      toast({
        title: "Failed to update issuer",
        description: "Please try again.",
        variant: "error",
      });
    }
  }

  const pendingIssuers  = issuers.filter((i) => i.status === "pending");
  const pendingOnChainIssuers = issuers.filter((i) => i.status === "pending_onchain");
  const approvedIssuers = issuers.filter((i) => i.status === "approved");

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview",     label: "Overview" },
    { id: "issuers",      label: "Issuers", count: (pendingIssuers.length + pendingOnChainIssuers.length) || undefined },
    { id: "events",       label: "Events" },
    { id: "certificates", label: "Certificates" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>Admin Dashboard</h1>
              <Badge variant="danger" dot>Admin Access</Badge>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Manage issuers, monitor events, review certificates.</p>
          </div>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} onClick={loadData}>
            Refresh
          </Button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-subtle)", borderRadius: "var(--radius)", padding: 4, marginBottom: 32, width: "fit-content" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "8px 18px", borderRadius: "var(--radius-sm)", border: "none",
              background: tab === t.id ? "var(--bg-card)" : "transparent",
              color: tab === t.id ? "var(--text-primary)" : "var(--text-muted)",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              boxShadow: tab === t.id ? "var(--shadow-sm)" : "none", transition: "all 0.15s",
            }}>
              {t.label}
              {t.count ? <span style={{ background: "var(--coral)", color: "white", width: 18, height: 18, borderRadius: "50%", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.count}</span> : null}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
            <RefreshCw size={24} style={{ animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            <p>Loading data...</p>
          </div>
        ) : (
          <>
            {/* ── Overview ── */}
            {tab === "overview" && (
              <div style={{ animation: "fadeUp 0.4s ease-out" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
                  <StatCard label="Total Issuers"     value={stats?.totalIssuers ?? 0}     icon={<Shield size={18} />} color="var(--mint)"  trend={`${stats?.pendingIssuers ?? 0} pending actions`} />
                  <StatCard label="Total Events"      value={stats?.totalEvents ?? 0}       icon={<Activity size={18} />} color="var(--accent)" />
                  <StatCard label="Live Now"          value={stats?.activeNow ?? 0}          icon={<TrendingUp size={18} />} color="var(--coral)" trend="Active events" />
                  <StatCard label="Pending Approval"  value={stats?.pendingIssuers ?? 0}    icon={<Clock size={18} />} color="var(--gold)" trend="Needs attention" />
                </div>

                {/* Recent issuers table */}
                <Card>
                  <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>All Issuers</h2>
                    <Badge variant={(pendingIssuers.length + pendingOnChainIssuers.length) > 0 ? "warning" : "success"}>
                      {(pendingIssuers.length + pendingOnChainIssuers.length) > 0 ? `${pendingIssuers.length + pendingOnChainIssuers.length} pending` : "All reviewed"}
                    </Badge>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--bg-subtle)" }}>
                          {["Name", "Organization", "Email", "Status", "AI Score", "Actions"].map((h) => (
                            <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {issuers.length === 0 ? (
                          <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>No issuers yet</td></tr>
                        ) : issuers.map((issuer) => (
                          <tr key={issuer.id} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "14px 20px", fontWeight: 600, fontSize: 13 }}>{issuer.name}</td>
                            <td style={{ padding: "14px 20px", fontSize: 13, color: "var(--text-secondary)" }}>{issuer.organization}</td>
                            <td style={{ padding: "14px 20px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{issuer.email}</td>
                            <td style={{ padding: "14px 20px" }}>
                              <Badge variant={issuer.status === "approved" ? "success" : issuer.status === "pending" ? "warning" : issuer.status === "pending_onchain" ? "info" : "danger"} dot>
                                {issuer.status === "pending_onchain" ? "pending on-chain" : issuer.status}
                              </Badge>
                            </td>
                            <td style={{ padding: "14px 20px", fontFamily: "var(--font-mono)", fontSize: 13, color: (issuer.aiScore ?? 0) >= 80 ? "var(--mint)" : (issuer.aiScore ?? 0) >= 55 ? "var(--gold)" : "var(--coral)", fontWeight: 700 }}>
                              {issuer.aiScore ?? "—"}{issuer.aiScore ? "/100" : ""}
                            </td>
                            <td style={{ padding: "14px 20px" }}>
                              {issuer.status === "pending" && (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <Button variant="secondary" size="sm" style={{ color: "var(--mint)", borderColor: "#a7f3d0" }} icon={<CheckCircle2 size={12} />} onClick={() => updateIssuerStatus(issuer.id, "pending_onchain")}>Approve Step 1</Button>
                                  <Button variant="danger" size="sm" icon={<XCircle size={12} />} onClick={() => updateIssuerStatus(issuer.id, "rejected")}>Reject</Button>
                                </div>
                              )}
                              {issuer.status === "pending_onchain" && (
                                <p style={{ fontSize: 11, color: "var(--accent-dark)", fontWeight: 600 }}>Waiting issuer tx proof</p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* ── Issuers tab ── */}
            {tab === "issuers" && (
              <div style={{ animation: "fadeUp 0.4s ease-out" }}>
                {pendingIssuers.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertTriangle size={16} color="var(--gold)" /> Pending Review ({pendingIssuers.length})
                    </h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {pendingIssuers.map((issuer) => {
                        const ai = aiResults[issuer.id];
                        return (
                          <Card key={issuer.id} style={{ padding: "24px" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                  <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{issuer.name}</h3>
                                  <Badge variant="warning">Pending</Badge>
                                </div>
                                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 2 }}>{issuer.organization}</p>
                                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{issuer.email}</p>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <Button variant="secondary" size="sm" icon={<Shield size={12} />} loading={reviewing === issuer.id} onClick={() => runAiCheck(issuer)}>
                                  {reviewing === issuer.id ? "AI analyzing..." : "Run AI Check"}
                                </Button>
                                <Button variant="secondary" size="sm" style={{ color: "var(--mint)", borderColor: "#a7f3d0" }} icon={<CheckCircle2 size={12} />} onClick={() => updateIssuerStatus(issuer.id, "pending_onchain")}>Approve Step 1</Button>
                                <Button variant="danger" size="sm" icon={<XCircle size={12} />} onClick={() => updateIssuerStatus(issuer.id, "rejected")}>Reject</Button>
                              </div>
                            </div>
                            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12, lineHeight: 1.5 }}>{issuer.description}</p>
                            {issuer.aiSummary && !ai && (
                              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-secondary)", borderLeft: "3px solid var(--accent)" }}>
                                <strong style={{ color: "var(--accent-dark)" }}>Previous AI Result (Score: {issuer.aiScore}/100): </strong>{issuer.aiSummary}
                              </div>
                            )}
                            {ai && (
                              <div style={{ marginTop: 16, background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "16px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-dark)", textTransform: "uppercase", letterSpacing: "0.06em" }}>AI Analysis</p>
                                  <Badge variant={ai.recommendation === "approve" ? "success" : ai.recommendation === "review" ? "warning" : "danger"}>
                                    {ai.recommendation.toUpperCase()} · Score: {ai.score}/100
                                  </Badge>
                                </div>
                                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{ai.summary}</p>
                                {ai.flags.length > 0 && (
                                  <div style={{ marginTop: 8 }}>
                                    {ai.flags.map((f: string) => <p key={f} style={{ fontSize: 11, color: "var(--gold)" }}>⚠ {f}</p>)}
                                  </div>
                                )}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {pendingOnChainIssuers.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                      <Clock size={16} color="var(--accent)" /> Awaiting On-Chain Proof ({pendingOnChainIssuers.length})
                    </h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {pendingOnChainIssuers.map((issuer) => (
                        <Card key={issuer.id} style={{ padding: "18px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div>
                              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{issuer.name}</p>
                              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{issuer.organization} • {issuer.email}</p>
                            </div>
                            <Badge variant="info" dot>Pending On-Chain</Badge>
                          </div>
                          <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
                            Waiting for issuer-signed transaction proof submission (tx digest + issuer cap/object id).
                          </p>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle2 size={16} color="var(--mint)" /> Approved Issuers ({approvedIssuers.length})
                  </h2>
                  {approvedIssuers.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No approved issuers yet.</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                      {approvedIssuers.map((issuer) => (
                        <Card key={issuer.id} style={{ padding: "20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, var(--sui-blue), var(--sui-teal))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white", fontSize: 16, fontFamily: "var(--font-display)" }}>
                              {issuer.name.charAt(0)}
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{issuer.name}</p>
                              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{issuer.organization}</p>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--mint)" }}>{issuer.aiScore}</p>
                              <p style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>AI SCORE</p>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Badge variant="success" dot>Approved</Badge>
                            {issuer.subscriptionActive && <span style={{ marginLeft: 4 }}><Badge variant="info">Active</Badge></span>}
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Events tab ── */}
            {tab === "events" && (
              <div style={{ animation: "fadeUp 0.4s ease-out" }}>
                <Card>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--bg-subtle)" }}>
                          {["Event", "Category", "Issuer", "Status", "Attendees", "Minted", ""].map((h) => (
                            <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {events.length === 0 ? (
                          <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>No events yet</td></tr>
                        ) : events.map((e) => (
                          <tr key={e.id} style={{ borderTop: "1px solid var(--border)" }}>
                            <td style={{ padding: "14px 20px", maxWidth: 240 }}>
                              <p style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{e.title}</p>
                            </td>
                            <td style={{ padding: "14px 20px" }}><Badge variant="sui">{e.category}</Badge></td>
                            <td style={{ padding: "14px 20px", fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{e.issuer?.name ?? "—"}</td>
                            <td style={{ padding: "14px 20px" }}>
                              <Badge variant={e.status === "live" ? "danger" : e.status === "ended" ? "default" : "warning"} dot={e.status === "live"}>{e.status}</Badge>
                            </td>
                            <td style={{ padding: "14px 20px", fontSize: 13, fontFamily: "var(--font-mono)" }}>{e.attendeeCount}</td>
                            <td style={{ padding: "14px 20px", fontSize: 13, fontFamily: "var(--font-mono)" }}>{e.mintedCount}</td>
                            <td style={{ padding: "14px 20px" }}>
                              <Button variant="ghost" size="sm" icon={<Eye size={12} />}>View</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* ── Certificates tab ── */}
            {tab === "certificates" && (
              <div style={{ animation: "fadeUp 0.4s ease-out" }}>
                <Card style={{ padding: 0 }}>
                  <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
                    <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>Certificates</h2>
                  </div>
                  <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
                    <Award size={36} style={{ margin: "0 auto 12px", color: "var(--border-strong)" }} />
                    <p style={{ fontSize: 14 }}>Certificate search available after Supabase is wired up (PRD-01).</p>
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
