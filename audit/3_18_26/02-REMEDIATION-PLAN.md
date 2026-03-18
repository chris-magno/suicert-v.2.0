# Remediation Plan

Date: 2026-03-18
Owner: Engineering / Security

## Phase 1 (Release Blocking)

1. Lock event mutation APIs
- Require authenticated Google session and issuer ownership for:
  - `POST /api/events`
  - `PATCH /api/events`
- Validate that caller's bound wallet/issuer identity matches `issuerId`.

2. Lock certificate minting and reads
- Require authenticated caller for `POST /api/certificates`.
- Verify caller owns the attendance/certificate context.
- Restrict `GET /api/certificates?email=...` to same-user email or admin-only access.

## Phase 2 (Identity Hardening)

3. CSRF hardening for identity mutations
- Add CSRF token validation for:
  - `POST /api/auth/wallet/bind`
  - `POST /api/auth/zklogin/verify`
- Keep `sameSite` cookie policy strict and documented.

4. Dev bypass control
- Add startup/runtime warning when `ZKLOGIN_DEV_BYPASS=true`.
- Optionally require explicit second flag in non-production (e.g., `ALLOW_INSECURE_ZKLOGIN_TEST=true`).

5. Google identity assurance
- Validate `email_verified` in sign-in callback where available.
- Optionally restrict issuer/admin flows to approved domains.

## Phase 3 (Operational Assurance)

6. Security tests
- Add integration tests for denied access to event and certificate mutation endpoints.
- Add tests for ownership checks and issuer-bound constraints.
- Add tests ensuring zkLogin verify remains fail-closed without real verifier.

7. Monitoring
- Add alert thresholds for repeated bind/verify failures in `auth_audit_logs`.
- Track abnormal event/certificate mutation attempts by IP/user.

## Go/No-Go Checklist

- Event and certificate mutation endpoints are authorization-protected.
- Identity mutation endpoints have CSRF mitigation.
- Dev bypass is impossible in production and tightly controlled in non-prod.
- Security integration tests are passing in CI.
