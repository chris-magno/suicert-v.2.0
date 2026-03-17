"use client";
// lib/wallet/context.tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { detectWalletRole, type WalletSession } from "./index";
import { sameSuiAddress } from "./address";

interface WalletContextValue {
  session:   WalletSession | null;
  loading:   boolean;
  authenticated: boolean;
  authenticating: boolean;
  authError: string | null;
  isAdmin:   boolean;
  isIssuer:  boolean;
  isUser:    boolean;
  connected: boolean;
  authenticate: () => Promise<boolean>;
  refresh:   () => void;
}

interface FlexibleSignedMessage {
  signatureSerialized?: string;
  signature?: string;
  bytes?: string;
  messageBytes?: string;
}

const WalletContext = createContext<WalletContextValue>({
  session: null, loading: false,
  authenticated: false, authenticating: false,
  authError: null,
  isAdmin: false, isIssuer: false, isUser: false, connected: false,
  authenticate: async () => false,
  refresh: () => {},
});

export function WalletSessionProvider({ children }: { children: ReactNode }) {
  const account               = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const authInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastAuthAttemptAtRef = useRef(0);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tick, setTick]       = useState(0);

  const refresh = () => setTick((t) => t + 1);

  function mapAuthError(errorText: string | undefined, code: string | undefined): string {
    if (code === "RATE_LIMIT_RAW" || code === "RATE_LIMIT_SCOPED") {
      return "Too many authentication attempts. Please wait and try again.";
    }
    if (code === "CHALLENGE_INVALID_OR_EXPIRED") {
      return "Challenge expired or already used. Please sign again.";
    }
    if (code === "SIGNED_BYTES_MISMATCH") {
      return "Signed message mismatch. Please approve the exact wallet prompt and try again.";
    }
    if (code === "INVALID_SIGNATURE") {
      return "Signature verification failed. Please retry and confirm with the same connected wallet.";
    }
    return errorText ?? "Authentication failed. Please try signing again.";
  }

  const authenticate = useCallback(async () => {
    if (!account?.address) return false;

    if (authenticated) return true;
    if (authInFlightRef.current) return authInFlightRef.current;

    const now = Date.now();
    if (now - lastAuthAttemptAtRef.current < 1200) {
      setAuthError("Please wait a moment before retrying authentication.");
      return false;
    }
    lastAuthAttemptAtRef.current = now;

    const run = (async () => {
      setAuthenticating(true);
      setAuthError(null);

      try {
        // If cookie-backed wallet session is still valid, reuse it.
        const existingRes = await fetch("/api/wallet/session", { cache: "no-store" });
        if (existingRes.ok) {
          const existingBody = await existingRes.json();
          const existingSession = existingBody?.session as WalletSession | null | undefined;
          if (sameSuiAddress(existingSession?.address, account.address)) {
            setAuthenticated(true);
            if (existingSession) {
              setSession((prev) => prev ?? existingSession);
            }
            return true;
          }
        }

        const challengeRes = await fetch("/api/wallet/session/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: account.address }),
        });
        if (!challengeRes.ok) {
          const err = await challengeRes.json().catch(() => ({}));
          if (challengeRes.status === 429) {
            const retryAfter = challengeRes.headers.get("Retry-After");
            setAuthError(`Too many auth attempts. Retry in ${retryAfter ?? "a few"} seconds.`);
            return false;
          }
          setAuthError(mapAuthError(err?.error, err?.code) ?? "Failed to request wallet challenge.");
          return false;
        }

        const challengeBody = await challengeRes.json();
        if (!challengeBody?.message || !challengeBody?.nonce) {
          setAuthError("Invalid wallet challenge response.");
          return false;
        }

        const signed = await signPersonalMessage({
          message: new TextEncoder().encode(challengeBody.message),
        });

      const signedPayload = signed as unknown as FlexibleSignedMessage;

      const signature =
        typeof signedPayload.signatureSerialized === "string"
          ? signedPayload.signatureSerialized
          : typeof signedPayload.signature === "string"
            ? signedPayload.signature
            : "";
      const signedBytes =
        typeof signedPayload.bytes === "string"
          ? signedPayload.bytes
          : typeof signedPayload.messageBytes === "string"
            ? signedPayload.messageBytes
            : "";
        if (!signature) {
          setAuthError("Wallet returned an invalid signature format.");
          return false;
        }

        const sessionRes = await fetch("/api/wallet/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: account.address,
            nonce: challengeBody.nonce,
            signature,
            signedBytes: signedBytes || undefined,
          }),
        });
        if (!sessionRes.ok) {
          const err = await sessionRes.json().catch(() => ({}));
          if (sessionRes.status === 429) {
            const retryAfter = sessionRes.headers.get("Retry-After");
            setAuthError(`Too many auth attempts. Retry in ${retryAfter ?? "a few"} seconds.`);
            return false;
          }
          setAuthError(mapAuthError(err?.error, err?.code));
          return false;
        }

        const sessionBody = await sessionRes.json();
        if (sessionBody?.session) {
          setSession((prev) => ({ ...(prev ?? {}), ...(sessionBody.session as WalletSession) } as WalletSession));
        }

      // Confirm cookie-backed session was actually set and matches wallet.
        const confirmedRes = await fetch("/api/wallet/session", { cache: "no-store" });
        if (!confirmedRes.ok) {
          setAuthenticated(false);
          setAuthError("Wallet session was not persisted. Please try again.");
          return false;
        }

        const confirmedBody = await confirmedRes.json();
        const confirmedSession = confirmedBody?.session as WalletSession | null | undefined;
        const isSameWallet = sameSuiAddress(confirmedSession?.address, account.address);
        if (!confirmedSession || !isSameWallet) {
          setAuthenticated(false);
          setAuthError("Authenticated session does not match connected wallet.");
          return false;
        }

        setAuthenticated(true);
        setSession((prev) => ({ ...(prev ?? {}), ...confirmedSession } as WalletSession));
        return true;
      } catch {
        setAuthError("Authentication failed. Please try signing again.");
        return false;
      } finally {
        setAuthenticating(false);
      }
    })();

    authInFlightRef.current = run;
    try {
      return await run;
    } finally {
      authInFlightRef.current = null;
    }
  }, [account?.address, authenticated, signPersonalMessage]);

  useEffect(() => {
    if (!account?.address) {
      setSession(null);
      setAuthenticated(false);
      setAuthError(null);
      return;
    }
    setLoading(true);
    detectWalletRole(account.address)
      .then(async (walletRoleSession) => {
        setSession(walletRoleSession);

        // Hydrate existing authenticated wallet session without prompting for a signature.
        const existingRes = await fetch("/api/wallet/session", { cache: "no-store" });
        if (!existingRes.ok) {
          setAuthenticated(false);
          return;
        }

        const existingBody = await existingRes.json();
        const existingSession = existingBody?.session as WalletSession | null | undefined;
        const isSameWallet = sameSuiAddress(existingSession?.address, account.address);
        setAuthenticated(Boolean(existingSession && isSameWallet));
        if (existingSession && isSameWallet) setAuthError(null);

        if (existingSession && isSameWallet) {
          setSession((prev) => ({ ...(prev ?? {}), ...existingSession } as WalletSession));
        }
      })
      .catch(() => {
        const fallback: WalletSession = { address: account.address, role: "user" };
        setSession(fallback);
        setAuthenticated(false);
      })
      .finally(() => setLoading(false));
  }, [account?.address, tick]);

  const role = session?.role ?? "user";

  return (
    <WalletContext.Provider value={{
      session,
      loading,
      authenticated,
      authenticating,
      authError,
      isAdmin:   role === "admin",
      isIssuer:  role === "issuer" || role === "admin",
      isUser:    !!account,
      connected: !!account,
      authenticate,
      refresh,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWalletSession = () => useContext(WalletContext);
