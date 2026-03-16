// app/auth/signin/page.tsx
// Force dynamic so searchParams resolves at runtime, not build time
export const dynamic = "force-dynamic";

import Link from "next/link";
import { Shield } from "lucide-react";
import { signIn } from "@/lib/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 400,
        background: "var(--bg-card)", border: "1.5px solid var(--border)",
        borderRadius: "var(--radius-xl)", padding: "40px",
        boxShadow: "var(--shadow-xl)", animation: "scaleIn 0.3s ease-out",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 13,
            background: "linear-gradient(135deg, #4DA2FF, #97EFE9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <Shield size={24} color="white" strokeWidth={2.5} />
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24,
            letterSpacing: "-0.03em", marginBottom: 6,
          }}>
            Welcome to SUI<span style={{ color: "var(--accent)" }}>CERT</span>
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
            Sign in to access your certificates
          </p>
        </div>

        {/* Google sign-in */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            style={{
              width: "100%", padding: "12px 20px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              background: "var(--bg-card)", border: "1.5px solid var(--border)",
              borderRadius: "var(--radius-sm)", cursor: "pointer",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15,
              color: "var(--text-primary)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
              <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
            </svg>
            Continue with Google
          </button>
        </form>

        <p style={{
          textAlign: "center", fontSize: 12, color: "var(--text-muted)",
          marginTop: 24, lineHeight: 1.6,
        }}>
          By signing in you agree to our terms. Your Google identity derives a
          Sui wallet via zkLogin — no private key is ever stored.
        </p>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <Link href="/" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
            ← Back to SUICERT
          </Link>
        </div>
      </div>
    </div>
  );
}
