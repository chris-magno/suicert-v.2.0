import Link from "next/link";
import { Shield, Zap, Lock, Award, ChevronRight, Globe, Users, TrendingUp } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import { Badge } from "@/components/ui";

import EventCard from "@/components/events/EventCard";

export default function HomePage() {
  const featuredEvents: import("@/types").CertEvent[] = [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />

      {/* Hero */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "80px 24px 64px" }}>
        <div style={{ maxWidth: 720, animation: "fadeUp 0.6s ease-out both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <Badge variant="sui" dot>Live on Sui Mainnet</Badge>
            <Badge variant="success">AI-Verified Issuers</Badge>
          </div>

          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(40px, 6vw, 68px)",
            fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.08,
            marginBottom: 24,
          }}>
            Certifications that{" "}
            <span className="sui-gradient">can&apos;t be faked.</span>
          </h1>

          <p style={{
            fontSize: "clamp(15px, 2vw, 18px)", color: "var(--text-secondary)",
            lineHeight: 1.6, maxWidth: 560, marginBottom: 36,
          }}>
            SUICERT converts real attendance into Soulbound Tokens on the Sui blockchain.
            AI-verified issuers. Automated proof-of-attendance. No crypto knowledge needed.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/dashboard" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "var(--text-primary)", color: "white",
              padding: "13px 24px", borderRadius: "var(--radius)", textDecoration: "none",
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15,
              transition: "opacity 0.15s",
            }}>
              Browse Certifications <ChevronRight size={16} />
            </Link>
            <Link href="/issuer" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "var(--bg-card)", color: "var(--text-primary)",
              border: "1.5px solid var(--border)",
              padding: "13px 24px", borderRadius: "var(--radius)", textDecoration: "none",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15,
            }}>
              Become an Issuer
            </Link>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 1, background: "var(--border)", borderRadius: "var(--radius-lg)",
          overflow: "hidden", marginTop: 64, border: "1.5px solid var(--border)",
          animation: "fadeUp 0.6s 0.3s ease-out both",
        }}>
          {[
            { icon: <Award size={18} />, value: "0+", label: "Certs minted" },
            { icon: <Users size={18} />, value: "0+", label: "Verified issuers" },
            { icon: <Globe size={18} />, value: "0+", label: "Events hosted" },
            { icon: <TrendingUp size={18} />, value: "0", label: "Minted today" },
            { icon: <Zap size={18} />, value: "<2 min", label: "AI verification" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "var(--bg-card)", padding: "20px 24px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}>
              <div style={{ color: "var(--accent)" }}>{s.icon}</div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live events */}
      {featuredEvents.length > 0 && (
        <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800 }}>Live Right Now</h2>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Join and earn your certificate today</p>
            </div>
            <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              View all <ChevronRight size={14} />
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
            {featuredEvents.map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        </section>
      )}

      {/* How it works */}
      <section style={{ background: "var(--bg-card)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "72px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, marginBottom: 12 }}>5 phases. One trusted certificate.</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 16, maxWidth: 480, margin: "0 auto" }}>End-to-end from registration to lifetime verification.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 2, background: "var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1.5px solid var(--border)" }}>
            {[
              { phase: "01", title: "Setup", icon: "🔐", desc: "Issuer registers & pays via USDT (Wormhole bridged)", tech: "zkLogin + Wormhole" },
              { phase: "02", title: "Audit", icon: "🤖", desc: "AI verifies issuer credentials in under 2 minutes", tech: "Claude Opus + Supabase" },
              { phase: "03", title: "Event", icon: "📡", desc: "Attendees join Google Meet, progress tracked live", tech: "Google API + Ably" },
              { phase: "04", title: "Mint", icon: "⛓️", desc: "Soulbound Token generated automatically on Sui", tech: "Sui PTB + Pinata" },
              { phase: "05", title: "Verify", icon: "✅", desc: "Anyone can verify with a QR code scan", tech: "Sui Explorer + AI" },
            ].map((step) => (
              <div key={step.phase} style={{ background: "var(--bg-card)", padding: "28px 20px" }}>
                <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 700, marginBottom: 10 }}>PHASE {step.phase}</p>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{step.icon}</div>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{step.title}</h3>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 10 }}>{step.desc}</p>
                <p style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", background: "var(--bg-subtle)", padding: "3px 8px", borderRadius: 99, display: "inline-block" }}>{step.tech}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "72px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {[
            { icon: <Lock size={20} />, title: "Soulbound & Immutable", desc: "Certificates are non-transferable SBTs on Sui. Once minted, they're yours forever and can&apos;t be forged or revoked.", color: "var(--accent)" },
            { icon: <Zap size={20} />, title: "Automated Attendance", desc: "Google Meet webhooks + Ably real-time tracking means no manual verification. Progress updates in under 100ms.", color: "var(--gold)" },
            { icon: <Shield size={20} />, title: "AI-Verified Issuers", desc: "Every issuer goes through AI background checks scoring trust 0-100. Only credible organizations issue certificates.", color: "var(--mint)" },
            { icon: <Globe size={20} />, title: "Web2 UX, Web3 Trust", desc: "Log in with Google. No wallet needed. zkLogin abstracts all blockchain complexity while preserving full on-chain proof.", color: "var(--coral)" },
          ].map((f) => (
            <div key={f.title} style={{
              background: "var(--bg-card)", border: "1.5px solid var(--border)",
              borderRadius: "var(--radius-lg)", padding: "28px",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: "var(--radius-sm)",
                background: `${f.color}14`, display: "flex", alignItems: "center",
                justifyContent: "center", color: f.color, marginBottom: 16,
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "32px 24px", background: "var(--bg-card)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              background: "linear-gradient(135deg, #4DA2FF, #97EFE9)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Shield size={13} color="white" />
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14 }}>
              SUI<span style={{ color: "var(--accent)" }}>CERT</span>
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            © 2026 SUICERT. Built on Sui blockchain. All credentials are immutable on-chain.
          </p>
          <div style={{ display: "flex", gap: 16 }}>
            {["Dashboard", "Issuer Portal", "Admin", "Docs"].map((l) => (
              <Link key={l} href="/" style={{ fontSize: 12, color: "var(--text-muted)", textDecoration: "none" }}>{l}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
