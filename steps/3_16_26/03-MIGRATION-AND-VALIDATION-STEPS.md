# Migration and Validation Steps

Date: 2026-03-16
Purpose: Move updated issuer workflow safely to Supabase and verify behavior.

## A. Database Migration

1. Open Supabase SQL Editor.
2. Execute incremental migration:
   - scripts/supabase-issuer-onchain-migration.sql
3. Verify columns on issuers table exist:
   - status includes pending_onchain
   - issuer_cap_id
   - registration_tx_digest
   - registration_explorer_url
   - onchain_registered_at

## B. Workflow Validation (Current Logic)

1. Submit issuer application as wallet user.
- Expected: status = pending

2. Approve step 1 in admin dashboard.
- Expected: status = pending_onchain

3. Submit proof in issuer portal with txDigest and issuerCapId.
- Expected: status = approved
- Expected metadata persisted:
  - registration_tx_digest
  - registration_explorer_url (auto or provided)
  - issuer_cap_id
  - onchain_registered_at

## C. Negative Tests

1. Invalid tx digest format
- Expected: 400 validation failed

2. Invalid issuer cap format
- Expected: 400 validation failed

3. Proof submission when status != pending_onchain
- Expected: 409 conflict

## D. Security Validation (Must-Fix Gap Confirmation)

1. Direct PATCH to /api/issuers without admin auth
- Current expected: likely succeeds (security gap)

2. Spoof wallet session through /api/wallet/session then submit proof
- Current expected: may succeed if wallet matches issuer (security gap)

## E. Deployment Recommendation
Do not deploy to production until remediations in steps/02-REMEDIATION-PLAN.md are complete.
