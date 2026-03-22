"use client";

import { useCallback, useEffect, useState } from "react";

interface IdentityStatusResponse {
  ok?: boolean;
  authenticated?: boolean;
  identity?: {
    authProvider?: string | null;
    zkloginAddress?: string | null;
    walletBoundAddress?: string | null;
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
}

export interface IdentityStatusState {
  loading: boolean;
  error: string | null;
  zkloginAddress: string | null;
  walletBoundAddress: string | null;
  walletSessionAddress: string | null;
  walletSessionAgeSeconds: number | null;
  walletActionMaxAgeSeconds: number;
  gates: {
    l1ZkIdentity: boolean;
    l2WalletMatch: boolean;
    l3SignatureFresh: boolean;
    l4CanExecuteWrite: boolean;
  };
  refresh: () => Promise<void>;
}

export function useIdentityStatus(): IdentityStatusState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zkloginAddress, setZkloginAddress] = useState<string | null>(null);
  const [walletBoundAddress, setWalletBoundAddress] = useState<string | null>(null);
  const [walletSessionAddress, setWalletSessionAddress] = useState<string | null>(null);
  const [walletSessionAgeSeconds, setWalletSessionAgeSeconds] = useState<number | null>(null);
  const [walletActionMaxAgeSeconds, setWalletActionMaxAgeSeconds] = useState(300);
  const [gates, setGates] = useState({
    l1ZkIdentity: false,
    l2WalletMatch: false,
    l3SignatureFresh: false,
    l4CanExecuteWrite: false,
  });

  const refresh = useCallback(async () => {
    setError(null);

    try {
      const res = await fetch("/api/auth/identity/status", { cache: "no-store" });
      const body = await res.json().catch(() => null) as IdentityStatusResponse | null;

      if (!res.ok || !body?.authenticated) {
        setZkloginAddress(null);
        setWalletBoundAddress(null);
        setWalletSessionAddress(null);
        setWalletSessionAgeSeconds(null);
        setGates({
          l1ZkIdentity: false,
          l2WalletMatch: false,
          l3SignatureFresh: false,
          l4CanExecuteWrite: false,
        });
        setError(body?.ok === false ? "Identity status unavailable" : null);
        return;
      }

      setZkloginAddress(body.identity?.zkloginAddress ?? null);
      setWalletBoundAddress(body.identity?.walletBoundAddress ?? null);
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
    walletSessionAddress,
    walletSessionAgeSeconds,
    walletActionMaxAgeSeconds,
    gates,
    refresh,
  };
}
