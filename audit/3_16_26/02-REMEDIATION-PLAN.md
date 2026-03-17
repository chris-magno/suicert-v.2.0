# SUICERT Remediation Plan

Date: 2026-03-16
Owner: Engineering / Security

## Phase 1: Block Critical Exploits (Immediate)

1. Protect issuer admin operations
- Add admin-only authorization in app/api/issuers/route.ts for:
  - GET /api/issuers (full list)
  - PATCH /api/issuers (status changes)
- Use trusted server-side role source (not client-submitted role).

2. Remove wallet identity spoofing vector
- Harden app/api/wallet/session/route.ts:
  - Do not accept arbitrary address/role directly.
  - Require signed nonce challenge verification from wallet before writing session.
- Add nonce table or short-lived store.

3. Enforce on-chain truth for proof endpoint
- In app/api/issuers/proof/route.ts:
  - Query Sui RPC for tx digest existence.
  - Verify object changes/events include the submitted issuerCapId.
  - Verify tx signer matches wallet session address.
  - Fail closed if any check fails.

## Phase 2: Data Integrity and Governance

4. Add database-level uniqueness
- Add unique functional index for normalized wallet identity to prevent duplicates under concurrency.
- If both wallet_address and sui_wallet_address are used, define one canonical column and backfill.

5. Enforce finite-state transition policy
- Allowed transitions:
  - pending -> pending_onchain | rejected
  - pending_onchain -> approved | rejected
- Reject direct pending -> approved unless explicit emergency override by admin.

6. Add audit trails
- Add issuer_status_history table:
  - issuer_id, old_status, new_status, actor, reason, timestamp
- Log tx digest validation result and signer address.

## Phase 3: Quality and Monitoring

7. Add integration tests
- Unauthorized PATCH rejected (401/403)
- Spoofed wallet session blocked
- Fake digest rejected
- Valid digest + signer + cap accepted

8. Add operational alerts
- Alert on repeated failed proof submissions.
- Alert on status changes outside allowed transitions.

## SQL Tasks
Run current incremental migration first:
- scripts/supabase-issuer-onchain-migration.sql

Then add follow-up migration for:
- unique wallet constraints
- status history table
- optional signer/validation fields

## Go/No-Go Checklist
- Critical findings closed
- Integration tests passing
- Manual red-team test of spoofed session fails
- Production logs show signer verification for approved issuers
