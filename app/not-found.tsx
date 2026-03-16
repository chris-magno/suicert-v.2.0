import Link from "next/link";
import { Shield, Search, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 40 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: "linear-gradient(135deg, #4DA2FF, #97EFE9)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Shield size={18} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>
            SUI<span style={{ color: "var(--accent)" }}>CERT</span>
          </span>
        </div>

        {/* 404 display */}
        <div style={{ marginBottom: 32 }}>
          <p style={{
            fontFamily: "var(--font-mono)", fontSize: 80, fontWeight: 700,
            lineHeight: 1, color: "var(--border-strong)", letterSpacing: "-0.04em",
            marginBottom: 0,
          }}>404</p>
          <div style={{
            height: 3, width: 80, margin: "16px auto",
            background: "linear-gradient(90deg, var(--sui-blue), var(--sui-teal))",
            borderRadius: 99,
          }} />
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800,
          letterSpacing: "-0.03em", marginBottom: 12, color: "var(--text-primary)",
        }}>
          Page not found
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 32 }}>
          The page you&apos;re looking for doesn&apos;t exist. It may have been moved,
          or you may have followed an invalid certificate link.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "11px 22px", borderRadius: "var(--radius-sm)",
            background: "var(--text-primary)", color: "white",
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
            textDecoration: "none",
          }}>
            <ArrowLeft size={14} /> Back to home
          </Link>
          <Link href="/dashboard" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "11px 22px", borderRadius: "var(--radius-sm)",
            background: "var(--bg-card)", color: "var(--text-secondary)",
            border: "1.5px solid var(--border)",
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
            textDecoration: "none",
          }}>
            <Search size={14} /> Browse events
          </Link>
        </div>
      </div>
    </div>
  );
}
