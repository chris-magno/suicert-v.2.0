// lib/auth/index.ts
// NextAuth v5 (Auth.js) — Google OAuth for attendees + admins
// Docs: https://authjs.dev/getting-started/installation?framework=next.js

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getUserIdentityByUserId } from "@/lib/supabase";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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

      if (token.sub) {
        const identity = await getUserIdentityByUserId(token.sub).catch(() => null);
        if (identity?.authProvider) provider = identity.authProvider;
        if (identity?.zkloginAddress) zkloginAddress = identity.zkloginAddress;
      }

      if (session.user && token.sub) {
        (session.user as typeof session.user & { id: string }).id = token.sub;
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
  secret: process.env.NEXTAUTH_SECRET,
});

// Admin emails — checked in middleware
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
