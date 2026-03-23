"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateNonce, generateRandomness, getExtendedEphemeralPublicKey } from "@mysten/sui/zklogin";

type FlowStage = "checking" | "starting" | "waiting-callback" | "success" | "error";

interface IdentityStatusResponse {
  authenticated?: boolean;
  user?: { email?: string | null; name?: string | null };
  identity?: {
    zkloginAddress?: string | null;
  };
  flow?: {
    currentStep?: "layer2_zklogin" | "layer3_wallet_bind" | "layer4_signature_verify" | "done";
    zkEpochValid?: boolean;
  };
}

export default function ZkLoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const fromCallback = searchParams.get("from") === "callback";
  const autoMode = searchParams.get("auto") === "1";
  const hasStartedRef = useRef(false);

  const [stage, setStage] = useState<FlowStage>("checking");
  const [status, setStatus] = useState("Checking Google session...");
  const [zkAddress, setZkAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadState() {
      try {
        const [sessionRes, identityRes] = await Promise.all([
          fetch("/api/auth/session", { cache: "no-store" }).catch(() => null),
          fetch("/api/auth/identity/status", { cache: "no-store" }).catch(() => null),
        ]);

        if (!active) return;

        const sessionBody = await sessionRes?.json().catch(() => null) as { user?: { email?: string | null; name?: string | null } } | null;
        const identityBody = await identityRes?.json().catch(() => null) as IdentityStatusResponse | null;

        const email = identityBody?.user?.email ?? sessionBody?.user?.email ?? null;
        setGoogleEmail(email);

        if (!email) {
          window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
          return;
        }

        const linkedAddress = identityBody?.identity?.zkloginAddress ?? null;
        setZkAddress(linkedAddress);

        if (fromCallback) {
          const raw = sessionStorage.getItem("zklogin:last-result");
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as { address?: string | null };
              if (parsed?.address) {
                setZkAddress(parsed.address);
              }
            } finally {
              sessionStorage.removeItem("zklogin:last-result");
            }
          }
        }

        const currentStep = identityBody?.flow?.currentStep;
        const zkEpochValid = identityBody?.flow?.zkEpochValid ?? false;

        if ((linkedAddress && zkEpochValid && currentStep !== "layer2_zklogin") || fromCallback) {
          setStage("success");
          setStatus("zkLogin verified. Redirecting to app...");
          window.setTimeout(() => {
            window.location.href = `/auth/callback?callbackUrl=${encodeURIComponent(callbackUrl)}`;
          }, 700);
          return;
        }

        setStage("starting");
        setStatus("Google session confirmed. Starting zk proof flow...");
      } catch {
        if (active) {
          setStage("error");
          setError("Unable to load auth state.");
        }
      } finally {
        if (active && stage === "checking") {
          // noop
        }
      }
    }

    void loadState();

    return () => {
      active = false;
    };
  }, [callbackUrl, fromCallback, stage]);

  useEffect(() => {
    if (stage !== "starting") return;
    if (hasStartedRef.current) return;

    hasStartedRef.current = true;
    void handleStartGoogleZkLogin();
  }, [stage]);

  async function handleStartGoogleZkLogin() {
    setStage("starting");
    setStatus("Initializing zk proof flow...");
    setError(null);

    try {
      const nonceRes = await fetch("/api/auth/zklogin/nonce", { cache: "no-store" });
      const nonceBody = await nonceRes.json().catch(() => ({}));

      if (!nonceRes.ok || !nonceBody?.ok) {
        setStage("error");
        setError(nonceBody?.error ?? "Unable to initialize zkLogin flow");
        return;
      }

      const googleClientId = typeof nonceBody?.oauth?.googleClientId === "string"
        ? nonceBody.oauth.googleClientId
        : "";

      if (!googleClientId) {
        setStage("error");
        setError("Google zkLogin client ID is not configured. Set NEXT_PUBLIC_ZKLOGIN_GOOGLE_CLIENT_ID.");
        return;
      }

      const maxEpoch = Number.parseInt(String(nonceBody.maxEpoch), 10);
      if (!Number.isFinite(maxEpoch)) {
        setStage("error");
        setError("Invalid maxEpoch from nonce bootstrap endpoint");
        return;
      }

      const keypair = Ed25519Keypair.generate();
      const jwtRandomness = generateRandomness();
      const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, jwtRandomness);
      const ephemeralPublicKeyRaw = keypair.getPublicKey().toBase64();
      const ephemeralPublicKey = keypair.getPublicKey().toSuiPublicKey();
      const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(keypair.getPublicKey());

      const state = crypto.randomUUID().replace(/-/g, "");
      const pendingFlow = {
        state,
        callbackUrl,
        maxEpoch,
        nonce,
        jwtRandomness,
        ephemeralPublicKeyRaw,
        ephemeralPublicKey,
        extendedEphemeralPublicKey,
        ephemeralSecretKey: keypair.getSecretKey(),
        createdAt: Date.now(),
      };
      localStorage.setItem(`zklogin:flow:${state}`, JSON.stringify(pendingFlow));

      setStage("waiting-callback");
      setStatus("Redirecting to Google for zk proof authorization...");

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
      setStage("error");
      setError(cause instanceof Error ? cause.message : "Unexpected zkLogin bootstrap error");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 560, background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
          zkLogin Identity
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
          {googleEmail ? `Signed in as ${googleEmail}. ` : ""}We are running the zkLogin proof flow directly.
        </p>

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 12, color: "var(--text-secondary)", background: "var(--bg-subtle)" }}>
          {status}
        </div>

        {zkAddress && (
          <p style={{ marginTop: 10, fontSize: 12, color: "#065f46", fontFamily: "var(--font-mono)" }}>
            Derived zk Sui address: {zkAddress}
          </p>
        )}

        {error && (
          <p style={{ marginTop: 10, fontSize: 12, color: "#dc2626" }}>{error}</p>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {stage === "error" && (
            <button
              onClick={() => { void handleStartGoogleZkLogin(); }}
              style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-card)", cursor: "pointer", fontWeight: 700 }}
            >
              Retry zkLogin
            </button>
          )}
          <Link href={callbackUrl} style={{ color: "var(--accent)", textDecoration: "none", fontSize: 12 }}>
            Continue to app
          </Link>
        </div>
      </div>
    </div>
  );
}
