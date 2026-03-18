# Change Summary

Date: 2026-03-18
Scope: auth model refactor (Google -> zkLogin -> wallet bind), issuer onboarding gating, profile UX, and navbar status indicators.

## Implemented Changes Audited

1. Identity model updates
- Google OAuth remains primary account sign-in.
- Session now carries `authProvider` and `zkloginAddress` when available.
- Added identity persistence via `user_identities` table.

2. zkLogin verification skeleton
- Added fail-closed verifier contract abstraction.
- Added `/api/auth/zklogin/verify` with structured input validation and audit event logging.
- Added optional dev-only bypass (`ZKLOGIN_DEV_BYPASS=true`) for local testing.

3. Wallet binding flow
- Added `/api/auth/wallet/bind` endpoint for linking verified wallet session to user identity.
- Added issuer onboarding policy requiring:
  - Google session
  - verified wallet session
  - wallet bound to same user

4. UX and access flow improvements
- Google sign-in redirects into zkLogin step flow.
- Global navbar status indicators added for Google/zkLogin/wallet-bound state.
- Added Google profile dropdown menu for profile/signout access.
- Fixed signout reliability using `next-auth/react` `signOut()` helper.

5. Public profiles
- Added public profile browse and detail endpoints/pages for approved issuer profiles.

6. Database migration
- Added additive migration script:
  - `scripts/supabase-zklogin-auth-migration.sql`
  - creates `user_identities` and `auth_audit_logs` with indexes and RLS policies.
