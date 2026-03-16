"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[SUICERT Error]", error);
  }, [error]);

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        maxWidth: 480, width: "100%", textAlign: "center",
        background: "var(--bg-card)", border: "1.5px solid var(--border)",
        borderRadius: "var(--radius-xl)", padding: "48px 40px",
        boxShadow: "var(--shadow-xl)", animation: "scaleIn 0.3s ease-out",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "var(--coral-subtle)", border: "2px solid #fca5a5",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px",
        }}>
          <AlertTriangle size={28} color="var(--coral)" />
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800,
          letterSpacing: "-0.03em", marginBottom: 8, color: "var(--text-primary)",
        }}>
          Something went wrong
        </h1>

        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 8 }}>
          An unexpected error occurred. Your certificates and blockchain data are safe.
        </p>

        {error.digest && (
          <p style={{
            fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
            background: "var(--bg-subtle)", padding: "6px 12px", borderRadius: "var(--radius-sm)",
            marginBottom: 24, display: "inline-block",
          }}>
            Error ID: {error.digest}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24 }}>
          <button
            onClick={reset}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "10px 20px", borderRadius: "var(--radius-sm)",
              background: "var(--text-primary)", color: "white", border: "none",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} /> Try again
          </button>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "10px 20px", borderRadius: "var(--radius-sm)",
            background: "var(--bg-subtle)", color: "var(--text-secondary)",
            border: "1.5px solid var(--border)",
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
            textDecoration: "none",
          }}>
            <Home size={14} /> Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
