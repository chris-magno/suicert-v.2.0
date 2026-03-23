"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getZkLoginSignature } from "@mysten/sui/zklogin";

interface PendingFlow {
  state: string;
  callbackUrl: string;
  maxEpoch: number;
  nonce: string;
  jwtRandomness: string;
  ephemeralPublicKeyRaw?: string;
  ephemeralPublicKey?: string;
  extendedEphemeralPublicKey: string;
  ephemeralSecretKey: string;
  createdAt: number;
}

type Stage =
  | "idle"
  | "parsing"
  | "requesting-proof"
  | "computing-proof"
  | "verifying-proof"
  | "success"
  | "error";

function getFlow(state: string): PendingFlow | null {
  try {
    const raw = localStorage.getItem(`zklogin:flow:${state}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingFlow;
    if (!parsed.state || !parsed.ephemeralSecretKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearFlow(state: string) {
  localStorage.removeItem(`zklogin:flow:${state}`);
}

export default function ZkLoginCallbackPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [status, setStatus] = useState("Preparing callback...");
  const [error, setError] = useState<string | null>(null);
  const [resultAddress, setResultAddress] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");

  const stageLabel = useMemo(() => {
    switch (stage) {
      case "parsing":
        return "Parsing Google callback";
      case "requesting-proof":
        return "Phase 1/3: Requesting proof";
      case "computing-proof":
        return "Phase 2/3: Computing proof locally";
      case "verifying-proof":
        return "Phase 3/3: Verifying with prover";
      case "success":
        return "Verification successful";
      case "error":
        return "Verification failed";
      default:
        return "Initializing";
    }
  }, [stage]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStage("parsing");
      setStatus("Reading id_token from Google OAuth redirect...");

      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      const idToken = hashParams.get("id_token");
      const oauthError = hashParams.get("error");
      const oauthErrorDescription = hashParams.get("error_description");
      const state = hashParams.get("state") ?? "";

      if (oauthError) {
        if (!cancelled) {
          setStage("error");
          setError(oauthErrorDescription ?? oauthError);
        }
        return;
      }

      if (!idToken || !state) {
        if (!cancelled) {
          setStage("error");
          setError("Missing id_token or state from OAuth callback");
        }
        return;
      }

      const flow = getFlow(state);
      if (!flow) {
        if (!cancelled) {
          setStage("error");
          setError("Missing local zkLogin flow context. Start from /auth/zklogin again.");
        }
        return;
      }

      setCallbackUrl(flow.callbackUrl || "/dashboard");

      const derivedPublicKey = Ed25519Keypair.fromSecretKey(flow.ephemeralSecretKey).getPublicKey();
      const ephemeralPublicKeyRaw = flow.ephemeralPublicKeyRaw || derivedPublicKey.toBase64();

      const ephemeralPublicKey = flow.ephemeralPublicKey
        ? flow.ephemeralPublicKey
        : derivedPublicKey.toSuiPublicKey();

      setStage("requesting-proof");
      setStatus("Requesting zk proof input material from server...");

      const saltRes = await fetch("/api/auth/zk-salt", { cache: "no-store" });
      const saltBody = await saltRes.json().catch(() => ({}));
      if (!saltRes.ok || !saltBody?.salt) {
        if (!cancelled) {
          setStage("error");
          setError(saltBody?.error ?? "Unable to resolve deterministic zk salt");
        }
        return;
      }

      const proofRes = await fetch("/api/auth/zklogin/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          maxEpoch: flow.maxEpoch,
          jwtRandomness: flow.jwtRandomness,
          ephemeralPublicKey,
          extendedEphemeralPublicKey: flow.extendedEphemeralPublicKey,
          keyClaimName: "sub",
          userSalt: saltBody.salt,
        }),
      });

      const proofBody = await proofRes.json().catch(() => ({}));
      if (!proofRes.ok || !proofBody?.ok) {
        if (!cancelled) {
          setStage("error");
          const detailReason = typeof proofBody?.details?.reason === "string"
            ? ` (${proofBody.details.reason})`
            : "";
          const detailEndpoint = typeof proofBody?.details?.saltEndpoint === "string"
            ? ` [endpoint: ${proofBody.details.saltEndpoint}]`
            : "";
          const proverReason = typeof proofBody?.details?.reason === "string" && !detailReason
            ? ` (${proofBody.details.reason})`
            : "";
          const proverEndpoint = typeof proofBody?.details?.proverEndpoint === "string"
            ? ` [prover: ${proofBody.details.proverEndpoint}]`
            : "";
          setError((proofBody?.error ?? "Failed to build zkLogin proof inputs") + detailReason + proverReason + detailEndpoint + proverEndpoint);
        }
        return;
      }

      setStage("computing-proof");
      setStatus("Computing and serializing zkLogin signature locally...");

      const keypair = Ed25519Keypair.fromSecretKey(flow.ephemeralSecretKey);
      const signResult = await keypair.signPersonalMessage(
        new TextEncoder().encode(`SUICERT zkLogin verify ${state}`)
      );

      const zkLoginSignature = getZkLoginSignature({
        inputs: proofBody.proofInputs,
        maxEpoch: String(flow.maxEpoch),
        userSignature: signResult.signature,
      });

      setStage("verifying-proof");
      setStatus("Submitting proof to verifier and linking identity...");

      const verifyRes = await fetch("/api/auth/zklogin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proof: {
            bytes: signResult.bytes,
            signature: zkLoginSignature,
            idToken,
            maxEpoch: String(flow.maxEpoch),
            userSignature: signResult.signature,
            proofInputs: proofBody.proofInputs,
          },
          binding: {
            nonce: flow.nonce,
            jwtRandomness: flow.jwtRandomness,
            maxEpoch: flow.maxEpoch,
            ephemeralPublicKeyRaw,
          },
          requestId: `zk-${Date.now()}-${state.slice(0, 8)}`,
        }),
      });

      const verifyBody = await verifyRes.json().catch(() => null);
      clearFlow(state);

      if (!verifyRes.ok || !verifyBody?.ok) {
        if (!cancelled) {
          setStage("error");
          const fallback = !verifyBody
            ? `zkLogin verification failed (HTTP ${verifyRes.status})`
            : undefined;
          setError(verifyBody?.reason ?? verifyBody?.error ?? fallback ?? "zkLogin verification failed");
        }
        return;
      }

      if (!cancelled) {
        setStage("success");
        setResultAddress(verifyBody?.zkloginAddress ?? proofBody.address ?? null);
        setStatus("zkLogin verified and linked. Returning to wizard...");
      }

      try {
        sessionStorage.setItem("zklogin:last-result", JSON.stringify({
          address: verifyBody?.zkloginAddress ?? proofBody.address ?? null,
          verifiedAt: new Date().toISOString(),
          callbackUrl: flow.callbackUrl || "/dashboard",
        }));
      } catch {}

      window.setTimeout(() => {
        const next = `/auth/callback?callbackUrl=${encodeURIComponent(flow.callbackUrl || "/dashboard")}`;
        window.location.href = next;
      }, 700);
    }

    run().catch((cause) => {
      if (!cancelled) {
        setStage("error");
        setError(cause instanceof Error ? cause.message : "Unexpected callback failure");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 560, background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 10 }}>zkLogin Proof Pipeline</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>
          {stageLabel}
        </p>

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 13, color: "var(--text-secondary)", background: "var(--bg)" }}>
          {status}
        </div>

        {resultAddress && (
          <p style={{ marginTop: 12, fontSize: 12, color: "#047857" }}>
            Linked zkLogin address: {resultAddress}
          </p>
        )}

        {error && (
          <p style={{ marginTop: 12, fontSize: 12, color: "#dc2626", lineHeight: 1.6 }}>
            {error}
          </p>
        )}

        <div style={{ marginTop: 18, fontSize: 12, display: "flex", gap: 12 }}>
          <Link href="/auth/zklogin" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Retry zkLogin
          </Link>
          <Link href={callbackUrl} style={{ color: "var(--accent)", textDecoration: "none" }}>
            Continue to app
          </Link>
        </div>
      </div>
    </div>
  );
}
