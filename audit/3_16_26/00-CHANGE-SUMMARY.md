# Change Summary

Date: 2026-03-16

## Implemented Changes Covered by Audit

1. Issuer registration flow
- New applications forced to pending.
- Wallet address inferred from wallet session when omitted.
- Duplicate wallet checks improved across wallet_address / sui_wallet_address.

2. Approval lifecycle
- Added pending_onchain status.
- Admin action now moves pending -> pending_onchain.
- Final approved requires proof submission.

3. Proof endpoint
- Added POST /api/issuers/proof.
- Accepts txDigest + issuerCapId.
- Stores on-chain metadata in issuers table.

4. Validation improvements
- Added strict Sui-format regex checks for txDigest and issuerCapId.
- Added optional explorerUrl support with generated fallback URL.

5. Schema/migrations
- Updated base schema with on-chain fields and pending_onchain state.
- Added incremental migration for existing DBs.

6. UI updates
- Admin dashboard shows:
  - Pending Review
  - Awaiting On-Chain Proof
  - Final Approved
- Issuer portal shows pending_onchain state and proof submission form.

7. AI scoring transparency
- Mock verification now deterministic (no random score perturbation).
- Includes provider and scoreBreakdown in response.
