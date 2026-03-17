"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function ZkLoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/auth/zklogin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: {
            bytes: "dev-bytes",
            signature: "dev-signature",
            address,
          },
          expectedAddress: address,
          requestId: `dev-${Date.now()}`,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.reason ?? data?.error ?? "zkLogin verification failed");
        return;
      }

      setMessage(`zkLogin linked: ${data.zkloginAddress ?? "unknown address"}`);
      window.setTimeout(() => {
        window.location.href = callbackUrl;
      }, 700);
    } catch {
      setError("Network error while calling zkLogin verify endpoint");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 540, background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 10 }}>zkLogin Test Flow</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
          Sign in with Google first, then link a test zkLogin address. This works only when <strong>ZKLOGIN_DEV_BYPASS=true</strong> in development.
        </p>

        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>zkLogin address (Sui)</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x..."
          style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", marginBottom: 14 }}
        />

        <button
          onClick={handleVerify}
          disabled={loading || !address.trim()}
          style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "none", cursor: loading ? "not-allowed" : "pointer", background: "linear-gradient(135deg, #4DA2FF, #097EED)", color: "white", fontWeight: 700 }}
        >
          {loading ? "Verifying..." : "Verify zkLogin (Dev)"}
        </button>

        {message && (
          <p style={{ marginTop: 12, fontSize: 12, color: "#047857" }}>{message}</p>
        )}
        {error && (
          <p style={{ marginTop: 12, fontSize: 12, color: "#dc2626" }}>{error}</p>
        )}

        <div style={{ marginTop: 18, fontSize: 12 }}>
          <Link href={callbackUrl} style={{ color: "var(--accent)", textDecoration: "none" }}>Continue to app</Link>
        </div>
      </div>
    </div>
  );
}
