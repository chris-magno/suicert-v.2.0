"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateNonce, generateRandomness, getExtendedEphemeralPublicKey } from "@mysten/sui/zklogin";

export default function ZkLoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [proofBytes, setProofBytes] = useState("");
  const [proofSignature, setProofSignature] = useState("");
  const [proofInputsRaw, setProofInputsRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingLinked, setCheckingLinked] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkExistingLink() {
      try {
        const sessionRes = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);
        if (!active) return;

        if (sessionRes?.ok) {
          const sessionBody = await sessionRes.json().catch(() => null) as { zkloginAddress?: string | null } | null;
          if (sessionBody?.zkloginAddress) {
            window.location.href = callbackUrl;
            return;
          }
        }

        const res = await fetch("/api/auth/zklogin/verify", { cache: "no-store" }).catch(() => null);
        if (!active) return;

        if (!res?.ok) {
          setCheckingLinked(false);
          return;
        }

        const body = await res.json().catch(() => null) as { identity?: { zkloginAddress?: string | null } } | null;
        const linkedAddress = body?.identity?.zkloginAddress;

        if (linkedAddress) {
          window.location.href = callbackUrl;
          return;
        }

        setCheckingLinked(false);
      } catch {
        if (active) setCheckingLinked(false);
      }
    }

    checkExistingLink();

    return () => {
      active = false;
    };
  }, [callbackUrl]);

  async function handleStartGoogleZkLogin() {
    setAutoLoading(true);
    setAutoError(null);

    try {
      const nonceRes = await fetch("/api/auth/zklogin/nonce", { cache: "no-store" });
      const nonceBody = await nonceRes.json().catch(() => ({}));

      if (!nonceRes.ok || !nonceBody?.ok) {
        setAutoError(nonceBody?.error ?? "Unable to initialize zkLogin flow");
        return;
      }

      const googleClientId = typeof nonceBody?.oauth?.googleClientId === "string"
        ? nonceBody.oauth.googleClientId
        : "";

      if (!googleClientId) {
        setAutoError("Google zkLogin client ID is not configured. Set NEXT_PUBLIC_ZKLOGIN_GOOGLE_CLIENT_ID.");
        return;
      }

      const maxEpoch = Number.parseInt(String(nonceBody.maxEpoch), 10);
      if (!Number.isFinite(maxEpoch)) {
        setAutoError("Invalid maxEpoch from nonce bootstrap endpoint");
        return;
      }

      const keypair = Ed25519Keypair.generate();
      const jwtRandomness = generateRandomness();
      const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, jwtRandomness);
      const ephemeralPublicKey = keypair.getPublicKey().toSuiPublicKey();
      const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(keypair.getPublicKey());

      const state = crypto.randomUUID().replace(/-/g, "");
      const pendingFlow = {
        state,
        callbackUrl,
        maxEpoch,
        jwtRandomness,
        ephemeralPublicKey,
        extendedEphemeralPublicKey,
        ephemeralSecretKey: keypair.getSecretKey(),
        createdAt: Date.now(),
      };
      sessionStorage.setItem(`zklogin:flow:${state}`, JSON.stringify(pendingFlow));

      const redirectUri = `${window.location.origin}/auth/zklogin/callback`;
      const authorizeUrl = new URL(
        nonceBody?.oauth?.authorizeUrl || "https://accounts.google.com/o/oauth2/v2/auth"
      );
      authorizeUrl.searchParams.set("client_id", googleClientId);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("response_type", "id_token");
      authorizeUrl.searchParams.set("scope", "openid email profile");
      authorizeUrl.searchParams.set("nonce", nonce);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("prompt", "select_account");

      window.location.href = authorizeUrl.toString();
    } catch (cause) {
      setAutoError(cause instanceof Error ? cause.message : "Unexpected zkLogin bootstrap error");
    } finally {
      setAutoLoading(false);
    }
  }

  async function handleVerify() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      let proofInputs: Record<string, unknown> | undefined;
      if (proofInputsRaw.trim()) {
        try {
          proofInputs = JSON.parse(proofInputsRaw) as Record<string, unknown>;
        } catch {
          setError("proofInputs must be valid JSON");
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/auth/zklogin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: {
            bytes: proofBytes,
            signature: proofSignature,
            address,
            proofInputs,
          },
          expectedAddress: address || undefined,
          requestId: `zk-${Date.now()}`,
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
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 10 }}>zkLogin Verification</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
          Start automated zkLogin proof generation with Google and let SUICERT submit to verifier for you.
        </p>

        {checkingLinked && (
          <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
            Checking existing zkLogin link for this account...
          </p>
        )}

        <button
          onClick={handleStartGoogleZkLogin}
          disabled={autoLoading}
          style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "none", cursor: autoLoading ? "not-allowed" : "pointer", background: "linear-gradient(135deg, #4DA2FF, #097EED)", color: "white", fontWeight: 700, marginBottom: 10 }}
        >
          {autoLoading ? "Redirecting to Google..." : "Continue With Google zkLogin (Auto-Verify)"}
        </button>

        <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
          This flow creates nonce and ephemeral key material locally, gets id_token from Google callback, builds proof inputs via prover API, assembles zkLogin signature, then auto-submits to verifier.
        </p>

        {autoError && (
          <p style={{ marginBottom: 14, fontSize: 12, color: "#dc2626", lineHeight: 1.6 }}>{autoError}</p>
        )}

        <div style={{ borderTop: "1px solid var(--border)", margin: "14px 0", paddingTop: 14 }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
            Manual fallback payload submission
          </p>
        </div>

        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Expected zkLogin address (optional)</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x..."
          style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", marginBottom: 12 }}
        />

        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Proof bytes</label>
        <textarea
          value={proofBytes}
          onChange={(e) => setProofBytes(e.target.value)}
          placeholder="Base64/serialized proof bytes"
          rows={3}
          style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", marginBottom: 12, resize: "vertical" }}
        />

        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Proof signature</label>
        <textarea
          value={proofSignature}
          onChange={(e) => setProofSignature(e.target.value)}
          placeholder="zkLogin signature"
          rows={3}
          style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", marginBottom: 12, resize: "vertical" }}
        />

        <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Proof inputs JSON (optional)</label>
        <textarea
          value={proofInputsRaw}
          onChange={(e) => setProofInputsRaw(e.target.value)}
          placeholder='{"maxEpoch":"...","userSalt":"..."}'
          rows={3}
          style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", marginBottom: 14, resize: "vertical" }}
        />

        <button
          onClick={handleVerify}
          disabled={loading || !proofBytes.trim() || !proofSignature.trim()}
          style={{ width: "100%", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "none", cursor: loading ? "not-allowed" : "pointer", background: "linear-gradient(135deg, #4DA2FF, #097EED)", color: "white", fontWeight: 700 }}
        >
          {loading ? "Verifying..." : "Verify zkLogin"}
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
