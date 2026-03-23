// lib/auth/index.ts
// NextAuth v5 (Auth.js) — Google OAuth for attendees + admins
// Docs: https://authjs.dev/getting-started/installation?framework=next.js

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getUserIdentityByUserId } from "@/lib/supabase";

const RESOLVED_GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID?.trim()
  || process.env.AUTH_GOOGLE_ID?.trim()
  || process.env.NEXT_PUBLIC_ZKLOGIN_GOOGLE_CLIENT_ID?.trim()
  || "";

const RESOLVED_GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET?.trim()
  || process.env.AUTH_GOOGLE_SECRET?.trim()
  || "";

const RESOLVED_AUTH_SECRET =
  process.env.NEXTAUTH_SECRET?.trim()
  || process.env.AUTH_SECRET?.trim()
  || "";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: RESOLVED_GOOGLE_CLIENT_ID,
      clientSecret: RESOLVED_GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile",
          prompt: "select_account",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      // Meeting attendance relies on stable Google identity (email), so fail early if missing.
      if (!profile?.email) return false;
      return true;
    },
    async session({ session, token }) {
      let provider = typeof token.authProvider === "string" ? token.authProvider : "google";
      let zkloginAddress = typeof token.zkloginAddress === "string" ? token.zkloginAddress : undefined;

      // Keep Google profile fields stable even when downstream identity calls fail.
      const tokenName = typeof token.name === "string" ? token.name : undefined;
      const tokenImage = typeof token.picture === "string" ? token.picture : undefined;

      if (token.sub) {
        const identity = await getUserIdentityByUserId(token.sub).catch(() => null);
        if (identity?.authProvider) provider = identity.authProvider;
        if (identity?.zkloginAddress) zkloginAddress = identity.zkloginAddress;
      }

      if (session.user && token.sub) {
        (session.user as typeof session.user & { id: string }).id = token.sub;
        if (!session.user.name && tokenName) {
          session.user.name = tokenName;
        }
        if (!session.user.image && tokenImage) {
          session.user.image = tokenImage;
        }
      }
      (session as typeof session & { zkloginAddress?: string }).zkloginAddress = zkloginAddress;
      (session as typeof session & { authProvider?: string }).authProvider =
        provider;
      return session;
    },
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.authProvider = account.provider;
      } else if (typeof token.authProvider !== "string") {
        token.authProvider = "google";
      }

      if (token.sub && typeof token.zkloginAddress !== "string") {
        const identity = await getUserIdentityByUserId(token.sub).catch(() => null);
        if (identity?.zkloginAddress) {
          token.zkloginAddress = identity.zkloginAddress;
        }
      }

      return token;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  secret: RESOLVED_AUTH_SECRET,
});

// Admin emails — checked in middleware
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
