# SUICERT Move Contract — Deployment Guide

## Prerequisites

```bash
# Install Sui CLI
cargo install --locked --git https://github.com/MystenLabs/sui.git sui

# Create / switch to mainnet environment
sui client new-env --alias mainnet --rpc https://fullnode.mainnet.sui.io:443
sui client switch --env mainnet

# Check active address has SUI for gas
sui client balance
```

---

## Build & Test

```bash
cd move/suicert

# Build (catches all type errors)
sui move build

# Run full test suite (28 tests)
sui move test

# Run a specific test
sui move test test_mint_success

# Verbose output
sui move test --verbose
```

---

## Publish to Devnet (first)

```bash
sui client switch --env devnet
sui client publish --gas-budget 200000000
```

Note the `packageId` from the output. Update `Move.toml`:
```toml
[addresses]
suicert = "0xYOUR_DEVNET_PACKAGE_ID"
```

---

## Publish to Mainnet

```bash
sui client switch --env mainnet
sui client publish --gas-budget 200000000 2>&1 | tee publish-output.txt
```

From the output, note:
- `packageId`   → the contract address (update `SUI_PACKAGE_ID` in `.env.local`)
- `AdminCap ID` → store securely; controls all minting
- `GlobalRegistry ID` → shared object used in every transaction

---

## Post-Deploy: Update Next.js `.env.local`

```env
SUI_PACKAGE_ID=0xYOUR_PACKAGE_ID
SUI_ADMIN_CAP_ID=0xYOUR_ADMIN_CAP_OBJECT_ID
SUI_GLOBAL_REGISTRY_ID=0xYOUR_GLOBAL_REGISTRY_ID
SUI_NETWORK=mainnet
```

---

## Calling the Contract from TypeScript

```typescript
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
const keypair = Ed25519Keypair.fromSecretKey(
  Buffer.from(process.env.SUI_ADMIN_PRIVATE_KEY!, 'hex')
);

// ── Mint a certificate ──────────────────────────────────────────────────────
const tx = new Transaction();
tx.moveCall({
  target: `${process.env.SUI_PACKAGE_ID}::soulbound::mint`,
  arguments: [
    tx.object(process.env.SUI_ADMIN_CAP_ID!),       // &AdminCap
    tx.object(eventRecordId),                         // &mut EventRecord
    tx.object(process.env.SUI_GLOBAL_REGISTRY_ID!),  // &mut GlobalRegistry
    tx.object('0x6'),                                 // &Clock (system object)
    tx.pure.address(recipientAddress),
    tx.pure.vector('u8', Array.from(Buffer.from(recipientName))),
    tx.pure.vector('u8', Array.from(Buffer.from(issuerId))),
    tx.pure.vector('u8', Array.from(Buffer.from(metadataUri))),
    tx.pure.vector('u8', Array.from(Buffer.from(aiSummary))),
    tx.pure.u64(attendanceMinutes),
    tx.pure.u8(attendancePct),
  ],
});

const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showObjectChanges: true, showEvents: true },
});

// Extract the minted cert's object ID from events
const mintEvent = result.events?.find(e => e.type.includes('CertMinted'));
const certObjectId = mintEvent?.parsedJson?.cert_id;
```

---

## Entry Functions Reference

| Function | Caller | Description |
|---|---|---|
| `register_issuer` | Admin | Mint IssuerCap after AI verification |
| `deactivate_issuer` | Admin | Pause issuer (subscription lapsed) |
| `reactivate_issuer` | Admin | Resume issuer after renewal |
| `pay_subscription` | Issuer | Pay SUI fee to activate cap |
| `create_event` | Issuer | Create shared EventRecord (draft) |
| `set_event_status` | Issuer | Change draft→live→ended |
| `admin_set_event_status` | Admin | Force-set any event status |
| `mint` | Admin | Mint SBT for verified attendee |
| `revoke` | Admin | Mark cert as revoked |
| `set_cert_fee` | Admin | Update per-cert platform fee |
| `set_subscription_fee` | Admin | Update subscription price |

---

## Error Codes

| Code | Constant | Meaning |
|---|---|---|
| 1 | `EAlreadyRevoked` | Cert already revoked |
| 3 | `EIssuerInactive` | Issuer cap not active |
| 4 | `EDuplicateCert` | Recipient already has cert for this event |
| 5 | `EEventNotLive` | Event must be STATUS_LIVE to mint |
| 6 | `EAttendanceInsufficient` | Below 80% attendance threshold |
| 7 | `EInsufficientPayment` | SUI payment below required fee |
| 8 | `EEventCapReached` | Event max_certs limit reached |
| 9 | `EIssuerMismatch` | IssuerCap doesn't own this event |
| 10 | `EStringTooLong` | Field exceeds 512-byte limit |
