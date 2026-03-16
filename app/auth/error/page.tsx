export const dynamic = "force-dynamic";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  Configuration:  "There is a problem with the server configuration.",
  AccessDenied:   "You do not have permission to sign in.",
  Verification:   "The verification link is invalid or has expired.",
  OAuthSignin:    "Error occurred while signing in with Google.",
  OAuthCallback:  "Error occurred in the OAuth callback.",
  Default:        "An authentication error occurred.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = ERROR_MESSAGES[error ?? "Default"] ?? ERROR_MESSAGES.Default;

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, textAlign: "center",
        background: "var(--bg-card)", border: "1.5px solid var(--border)",
        borderRadius: "var(--radius-xl)", padding: "40px",
        boxShadow: "var(--shadow-xl)",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--coral-subtle)", border: "2px solid #fca5a5",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px",
        }}>
          <AlertTriangle size={24} color="var(--coral)" />
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800,
          marginBottom: 8,
        }}>
          Sign in failed
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>
          {message}
        </p>
        {error && (
          <p style={{
            fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
            marginBottom: 20,
          }}>
            Code: {error}
          </p>
        )}
        <Link href="/auth/signin" style={{
          display: "inline-flex", padding: "10px 24px", borderRadius: "var(--radius-sm)",
          background: "var(--text-primary)", color: "white", textDecoration: "none",
          fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14,
        }}>
          Try again
        </Link>
      </div>
    </div>
  );
}
