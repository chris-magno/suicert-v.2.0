"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type AuthStep = "layer2_zklogin" | "layer3_wallet_bind" | "layer4_signature_verify" | "done";

interface IdentityStatusResponse {
  authenticated?: boolean;
  flow?: {
    currentStep?: AuthStep;
  };
}

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [status, setStatus] = useState("Validating Google session...");

  useEffect(() => {
    let active = true;

    async function run() {
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" }).catch(() => null);
      const sessionBody = await sessionRes?.json().catch(() => null) as { user?: { id?: string; email?: string } } | null;

      if (!active) return;

      if (!sessionBody?.user?.id) {
        window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
        return;
      }

      setStatus("Resolving layered auth progress...");
      const identityRes = await fetch("/api/auth/identity/status", { cache: "no-store" }).catch(() => null);
      const identity = await identityRes?.json().catch(() => null) as IdentityStatusResponse | null;
      const step = identity?.flow?.currentStep ?? "layer2_zklogin";

      if (step === "layer2_zklogin") {
        setStatus("Starting zkLogin layer...");
        window.location.href = `/auth/zklogin?callbackUrl=${encodeURIComponent(callbackUrl)}&auto=1`;
        return;
      }

      if (step === "layer3_wallet_bind") {
        setStatus("Continue with wallet bind layer...");
        window.location.href = "/profile";
        return;
      }

      if (step === "layer4_signature_verify") {
        setStatus("Continue with wallet signature verification...");
        window.location.href = "/profile";
        return;
      }

      setStatus("Authentication complete. Redirecting...");
      window.location.href = callbackUrl;
    }

    void run();

    return () => {
      active = false;
    };
  }, [callbackUrl]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 560, background: "var(--bg-card)", border: "1.5px solid var(--border)", borderRadius: "var(--radius-xl)", padding: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
          Completing Sign-in
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>{status}</p>
      </div>
    </div>
  );
}
