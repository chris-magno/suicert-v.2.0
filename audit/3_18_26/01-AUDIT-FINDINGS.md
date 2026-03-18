# System Audit Findings

Date: 2026-03-18
Scope: Current workspace state after auth and profile flow changes.

## Executive Summary

The new auth flow direction is strong: issuer onboarding now requires a Google session, verified wallet signature session, and user-wallet binding. Fail-closed zkLogin skeleton behavior and audit logging are also positive controls.

However, there are still critical API authorization gaps unrelated to UI flow. These allow state mutation and sensitive data access without proper server-side authorization.

## Findings (Ordered by Severity)

### 1. Critical: Event mutation endpoints are unauthenticated
- Severity: Critical
- Files:
  - app/api/events/route.ts
- Evidence:
  - `POST /api/events` accepts issuerId from request body and creates events without authz checks.
  - `PATCH /api/events` updates event status without authz checks.
- Impact:
  - Any caller can create/modify events.
  - Potential impersonation of issuers and platform data corruption.

### 2. High: Certificate minting endpoint is unauthenticated
- Severity: High
- Files:
  - app/api/certificates/route.ts
- Evidence:
  - `POST /api/certificates` mints certificates based on supplied attendanceId without verifying caller identity/ownership.
- Impact:
  - Unauthorized mint attempts and abuse of certificate issuance flow.

### 3. High: Certificate read endpoint can expose recipient data by email query
- Severity: High
- Files:
  - app/api/certificates/route.ts
- Evidence:
  - `GET /api/certificates?email=...` returns certificate list by email without auth checks.
- Impact:
  - Privacy/data leakage risk for recipient records.

### 4. Medium: Wallet bind and zkLogin verify state-changing endpoints lack explicit CSRF control
- Severity: Medium
- Files:
  - app/api/auth/wallet/bind/route.ts
  - app/api/auth/zklogin/verify/route.ts
- Evidence:
  - Both endpoints rely on cookie session auth but do not implement explicit anti-CSRF token verification.
- Impact:
  - Increased risk window if cookie policy or browser behavior changes.

### 5. Medium: Dev bypass verifier may be misused in non-production environments
- Severity: Medium
- Files:
  - lib/zklogin/verifier.ts
- Evidence:
  - `ZKLOGIN_DEV_BYPASS=true` enables non-cryptographic success path outside production.
- Impact:
  - Staging/test environments may produce misleading auth results.

### 6. Low: Google sign-in policy does not enforce verified email claim
- Severity: Low
- Files:
  - lib/auth/index.ts
- Evidence:
  - `signIn` callback checks email presence but not verified-email status.
- Impact:
  - Reduced identity assurance quality for sensitive workflows.

## Positive Controls Confirmed

- Issuer onboarding now enforces Google session + verified wallet + wallet-user bind.
- Admin route gating requires verified wallet admin role in middleware.
- zkLogin verify endpoint is fail-closed by default and logs audit events.
- Session enrichment from `user_identities` supports phased identity upgrade.
- Signout flow reliability improved using Auth.js client helper.

## Production Readiness Verdict

Current state: Not production-ready until Findings #1 and #2 are remediated.

Minimum release gate:
1. Add strict server authorization for `POST/PATCH /api/events`.
2. Add strict server authorization for `POST /api/certificates` and protect certificate query by user ownership.
3. Add CSRF protections for state-changing identity endpoints.
