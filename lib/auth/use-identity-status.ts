"use client";

import { useCallback, useEffect, useState } from "react";

interface IdentityStatusResponse {
  ok?: boolean;
  authenticated?: boolean;
  identity?: {
    authProvider?: string | null;
    zkloginAddress?: string | null;
    zkMaxEpoch?: number | null;
    walletBoundAddress?: string | null;
    walletBoundZkAddress?: string | null;
    walletBoundAt?: string | null;
    walletSignatureVerified?: boolean;
    walletVerifiedAt?: string | null;
    walletBindingSkippedAt?: string | null;
    lastWalletVerifiedAt?: string | null;
  };
  walletSession?: {
    address?: string | null;
    role?: "admin" | "issuer" | "user";
    verifiedAt?: string;
    expiresAt?: string;
    ageSeconds?: number | null;
  } | null;
  gates?: {
    l1ZkIdentity?: boolean;
    l2WalletMatch?: boolean;
    l3SignatureFresh?: boolean;
    l4CanExecuteWrite?: boolean;
  };
  policy?: {
    walletActionMaxAgeSeconds?: number;
  };
  flow?: {
    currentStep?: "layer2_zklogin" | "layer3_wallet_bind" | "layer4_signature_verify" | "done";
    currentEpoch?: number | null;
    zkMaxEpoch?: number | null;
    zkEpochValid?: boolean;
    canSkipWallet?: boolean;
    done?: boolean;
  };
}

interface RegistrationGuardResponse {
  ok?: boolean;
  authenticated?: boolean;
  registration?: {
    state?: "new" | "returning";
    hasProfile?: boolean;
    issuerStatus?: string | null;
    nextRoute?: string;
  };
}

type RegistrationState = "new" | "returning";

export interface IdentityStatusState {
  loading: boolean;
  error: string | null;
  zkloginAddress: string | null;
  walletBoundAddress: string | null;
  walletSignatureVerified: boolean;
  walletSessionAddress: string | null;
  walletSessionAgeSeconds: number | null;
  walletActionMaxAgeSeconds: number;
  gates: {
    l1ZkIdentity: boolean;
    l2WalletMatch: boolean;
    l3SignatureFresh: boolean;
    l4CanExecuteWrite: boolean;
  };
  registration: {
    state: RegistrationState;
    nextRoute: string;
    issuerStatus: string | null;
  };
  flow: {
    currentStep: "layer2_zklogin" | "layer3_wallet_bind" | "layer4_signature_verify" | "done";
    done: boolean;
    canSkipWallet: boolean;
  };
  refresh: () => Promise<void>;
}

export function useIdentityStatus(): IdentityStatusState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zkloginAddress, setZkloginAddress] = useState<string | null>(null);
  const [walletBoundAddress, setWalletBoundAddress] = useState<string | null>(null);
  const [walletSignatureVerified, setWalletSignatureVerified] = useState(false);
  const [walletSessionAddress, setWalletSessionAddress] = useState<string | null>(null);
  const [walletSessionAgeSeconds, setWalletSessionAgeSeconds] = useState<number | null>(null);
  const [walletActionMaxAgeSeconds, setWalletActionMaxAgeSeconds] = useState(300);
  const [gates, setGates] = useState({
    l1ZkIdentity: false,
    l2WalletMatch: false,
    l3SignatureFresh: false,
    l4CanExecuteWrite: false,
  });
  const [registration, setRegistration] = useState<{
    state: RegistrationState;
    nextRoute: string;
    issuerStatus: string | null;
  }>({
    state: "new",
    nextRoute: "/issuer?tab=apply",
    issuerStatus: null,
  });
  const [flow, setFlow] = useState<{
    currentStep: "layer2_zklogin" | "layer3_wallet_bind" | "layer4_signature_verify" | "done";
    done: boolean;
    canSkipWallet: boolean;
  }>({
    currentStep: "layer2_zklogin",
    done: false,
    canSkipWallet: true,
  });

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const [identityRes, registrationRes] = await Promise.all([
        fetch("/api/auth/identity/status", { cache: "no-store" }).catch(() => null),
        fetch("/api/auth/registration/guard", { cache: "no-store" }).catch(() => null),
      ]);

      const body = await identityRes?.json().catch(() => null) as IdentityStatusResponse | null;
      const registrationBody = await registrationRes?.json().catch(() => null) as RegistrationGuardResponse | null;

      if (!identityRes?.ok || !body?.authenticated) {
        setZkloginAddress(null);
        setWalletBoundAddress(null);
        setWalletSignatureVerified(false);
        setWalletSessionAddress(null);
        setWalletSessionAgeSeconds(null);
        setGates({
          l1ZkIdentity: false,
          l2WalletMatch: false,
          l3SignatureFresh: false,
          l4CanExecuteWrite: false,
        });
        setRegistration({
          state: "new",
          nextRoute: "/issuer?tab=apply",
          issuerStatus: null,
        });
        setFlow({
          currentStep: "layer2_zklogin",
          done: false,
          canSkipWallet: true,
        });
        setError(body?.ok === false ? "Identity status unavailable" : null);
        return;
      }

      setZkloginAddress(body.identity?.zkloginAddress ?? null);
      setWalletBoundAddress(body.identity?.walletBoundAddress ?? null);
      setWalletSignatureVerified(Boolean(body.identity?.walletSignatureVerified));
      setWalletSessionAddress(body.walletSession?.address ?? null);
      setWalletSessionAgeSeconds(
        typeof body.walletSession?.ageSeconds === "number" ? body.walletSession.ageSeconds : null
      );
      setWalletActionMaxAgeSeconds(
        typeof body.policy?.walletActionMaxAgeSeconds === "number"
          ? body.policy.walletActionMaxAgeSeconds
          : 300
      );
      setGates({
        l1ZkIdentity: Boolean(body.gates?.l1ZkIdentity),
        l2WalletMatch: Boolean(body.gates?.l2WalletMatch),
        l3SignatureFresh: Boolean(body.gates?.l3SignatureFresh),
        l4CanExecuteWrite: Boolean(body.gates?.l4CanExecuteWrite),
      });

      setRegistration({
        state: registrationBody?.registration?.state === "returning" ? "returning" : "new",
        nextRoute: registrationBody?.registration?.nextRoute ?? "/issuer?tab=apply",
        issuerStatus: registrationBody?.registration?.issuerStatus ?? null,
      });
      setFlow({
        currentStep: body.flow?.currentStep ?? "layer2_zklogin",
        done: Boolean(body.flow?.done),
        canSkipWallet: body.flow?.canSkipWallet ?? true,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load identity status");
    }
  }, []);

  useEffect(() => {
    let active = true;

    refresh()
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refresh]);

  return {
    loading,
    error,
    zkloginAddress,
    walletBoundAddress,
    walletSignatureVerified,
    walletSessionAddress,
    walletSessionAgeSeconds,
    walletActionMaxAgeSeconds,
    gates,
    registration,
    flow,
    refresh,
  };
}
