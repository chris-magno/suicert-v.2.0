# SUICERT Change Audit Findings

Date: 2026-03-16
Scope: issuer registration workflow, admin review flow, on-chain proof submission, Supabase schema/migration updates.

## Executive Summary
The recent changes correctly introduced a 3-step issuer lifecycle (pending -> pending_onchain -> approved), strict input format checks for Sui tx/object strings, and migration scripts for new issuer fields.

However, there are critical authorization gaps that currently allow status changes and proof completion without trusted identity verification. These must be fixed before production deployment.

## Findings (Ordered by Severity)

### 1. Critical: Unauthenticated issuer status mutation endpoint
- Severity: Critical
- Impact: Any caller can promote/reject issuer records by calling PATCH on issuers API.
- Evidence:
  - app/api/issuers/route.ts: PATCH handler has no admin authentication/authorization checks.
  - app/admin/page.tsx assumes admin-only UI, but backend still accepts direct API calls.
- Risk:
  - Unauthorized promotion to pending_onchain/rejected.
  - Data integrity loss and approval workflow bypass.

### 2. Critical: Wallet session endpoint allows address/role spoofing
- Severity: Critical
- Impact: Caller can POST arbitrary address/role into wallet session cookie.
- Evidence:
  - app/api/wallet/session/route.ts writes cookie from request body without cryptographic wallet proof.
  - app/api/issuers/proof/route.ts trusts wallet cookie to identify which issuer is submitting proof.
- Risk:
  - Impersonation of wallet identity.
  - Unauthorized final approval if attacker sets cookie to target wallet address.

### 3. High: Proof endpoint validates format only, not on-chain truth
- Severity: High
- Impact: Fake tx digest/object id with correct format can finalize issuer approval.
- Evidence:
  - app/api/issuers/proof/route.ts validates regex patterns but does not query Sui RPC for tx existence, ownership, or object changes.
- Risk:
  - False "on-chain approved" state in database.

### 4. High: Issuer list API exposes sensitive data without access control
- Severity: High
- Impact: Public callers can fetch full issuer records (including emails and verification metadata).
- Evidence:
  - app/api/issuers/route.ts GET has no auth checks.
  - lib/supabase/index.ts getIssuers now uses service-role client, returning unrestricted rows.
- Risk:
  - Data leakage and privacy/compliance violations.

### 5. Medium: Duplicate wallet prevention is app-level only (race condition risk)
- Severity: Medium
- Impact: Concurrent requests can still insert duplicates without DB uniqueness guarantee.
- Evidence:
  - scripts/supabase-migration.sql and scripts/supabase-issuer-onchain-migration.sql do not enforce unique index/constraint for normalized wallet columns.
- Risk:
  - Duplicate issuer registrations under race/load.

### 6. Low: Status transition rules are not enforced centrally
- Severity: Low
- Impact: API accepts arbitrary status values and direct transitions.
- Evidence:
  - app/api/issuers/route.ts PATCH passes status directly to updateIssuerStatus.
- Risk:
  - Invalid lifecycle transitions, harder auditing.

## Positive Controls Added
- New lifecycle state pending_onchain is integrated in UI and types.
- Strict pattern validation for tx digest/object id exists.
- Optional explorer URL support with automatic fallback generation.
- Incremental migration script exists for existing Supabase DBs.

## Production Readiness Verdict
Current state: Not production-ready due to Critical findings #1 and #2.

Minimum release gate:
1. Add strict admin authz to issuer status PATCH and issuer listing GET.
2. Replace trust-on-cookie wallet identity with signature-verified proof.
3. Validate tx digest/object ownership against Sui RPC before final approval.
