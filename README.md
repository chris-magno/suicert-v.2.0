# SUICERT — Blockchain Certification SaaS

> Real-world achievements, immutably verified on Sui. AI-powered issuer vetting, automated proof-of-attendance, and Soulbound Token minting.

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![Sui](https://img.shields.io/badge/Sui-Move-4DA2FF)](https://sui.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org)

---

## Quick Start

```bash
git clone https://github.com/yourorg/suicert
cd suicert
npm install
cp .env.example .env.local   # fill in your keys
npm run dev                   # http://localhost:3000
```

---

## Project Structure

```
suicert/
├── app/
│   ├── page.tsx                         # Landing page
│   ├── dashboard/page.tsx               # Browse events
│   ├── events/[id]/page.tsx             # Event detail + live attendance tracker
│   ├── issuer/page.tsx                  # Issuer portal
│   ├── admin/page.tsx                   # Admin dashboard
│   ├── claim/[id]/page.tsx              # Certificate viewer
│   ├── verify/[objectId]/page.tsx       # Public QR verification
│   ├── auth/signin/page.tsx             # Google sign-in
│   ├── auth/error/page.tsx              # Auth error page
│   ├── error.tsx                        # Global error boundary
│   ├── not-found.tsx                    # 404 page
│   ├── loading.tsx                      # Loading skeleton
│   └── api/
│       ├── auth/[...nextauth]/route.ts  # NextAuth handler
│       ├── webhooks/meet/route.ts       # Google Meet webhook
│       ├── certificates/route.ts        # Mint SBT + AI summary
│       ├── issuers/route.ts             # Issuer CRUD + AI verify
│       ├── events/route.ts              # Events CRUD
│       ├── ably/route.ts                # Ably token auth
│       ├── ai/route.ts                  # AI proxy
│       └── health/route.ts             # Health check
│
├── components/
│   ├── ui/index.tsx                     # Design system components
│   ├── layout/Navbar.tsx                # Navigation
│   ├── events/EventCard.tsx             # Event card
│   ├── attendance/AttendanceTracker.tsx # Live progress bar
│   └── certificates/CertificateDisplay.tsx
│
├── lib/
│   ├── auth/index.ts                    # NextAuth config
│   ├── sui/index.ts                     # Sui blockchain (mock → production)
│   ├── ai/index.ts                      # Claude Opus (mock → production)
│   ├── ably/index.ts                    # Real-time (mock → production)
│   ├── supabase/index.ts                # Database (mock → production)
│   ├── pinata/index.ts                  # IPFS metadata
│   ├── wormhole/index.ts                # Cross-chain bridge
│   ├── validators/index.ts              # Zod schemas
│   └── mock-data.ts                     # Dev seed data
│
├── move/suicert/
│   ├── sources/soulbound.move           # Complete Move smart contract
│   ├── tests/soulbound_tests.move       # 20 unit tests
│   ├── Move.toml                        # Package manifest
│   └── DEPLOY.md                        # Deployment guide
│
├── scripts/
│   ├── supabase-migration.sql           # Full DB schema + RLS policies
│   └── test-webhook.js                  # Webhook simulation tool
│
├── middleware.ts                        # Auth + webhook guard
├── Dockerfile                           # 3-stage production image
├── vercel.json                          # Vercel config + security headers
└── .env.example                         # All required env variables
```

---

## Routes

| Route | Auth | Description |
|---|---|---|
| `/` | Public | Landing page |
| `/dashboard` | Public | Browse all events |
| `/events/[id]` | Public | Event detail + live attendance tracker |
| `/issuer` | 🔐 Login | Issuer portal — apply, create events |
| `/admin` | 🔐 Admin | Review issuers, monitor events |
| `/claim/[id]` | Public | View & share a certificate |
| `/verify/[objectId]` | Public | QR code verification page |
| `/auth/signin` | — | Google sign-in |

---

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/webhooks/meet` | Google Meet webhook (HMAC-verified, Zod-validated) |
| `GET/POST` | `/api/certificates` | Mint SBT, generate AI summary |
| `GET/POST/PATCH` | `/api/issuers` | Issuer management + AI verification |
| `GET/POST/PATCH` | `/api/events` | Events CRUD |
| `GET` | `/api/ably` | Ably auth token |
| `POST` | `/api/ai` | AI issuer verification |
| `GET` | `/api/health` | Health check (lists which services are configured) |

---

## Activating Production Services

All services have mock implementations that work out of the box. To go live, uncomment the production blocks in each lib file:

### 1. Claude Opus AI (`lib/ai/index.ts`)
```bash
# Set in .env.local:
ANTHROPIC_API_KEY=sk-ant-api03-...
```
Then uncomment the `import Anthropic` block and the two production functions.

### 2. Sui Blockchain (`lib/sui/index.ts`)
```bash
# After publishing the Move contract:
SUI_PACKAGE_ID=0x...
SUI_ADMIN_CAP_ID=0x...
SUI_GLOBAL_REGISTRY_ID=0x...
SUI_ADMIN_PRIVATE_KEY=...
```
Then uncomment the `import { Transaction }` block.

### 3. Ably Real-time (`lib/ably/index.ts`)
```bash
ABLY_API_KEY=xxxxx.yyyyy:zzzzz
```
Then uncomment the `import Ably` block.

### 4. Supabase Database (`lib/supabase/index.ts`)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```
Run `scripts/supabase-migration.sql` in your Supabase SQL editor, then uncomment the client.

---

## Deploying the Move Contract

```bash
# Install Sui CLI
cargo install --locked --git https://github.com/MystenLabs/sui.git sui

# Switch to devnet first
sui client new-env --alias devnet --rpc https://fullnode.devnet.sui.io:443
sui client switch --env devnet

# Build and test
cd move/suicert
sui move build
sui move test           # 20 tests should pass

# Publish to devnet
sui client publish --gas-budget 200000000

# After testing, publish to mainnet
sui client switch --env mainnet
sui client publish --gas-budget 200000000
```

See `move/suicert/DEPLOY.md` for the full deployment guide including TypeScript integration.

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Set all environment variables from `.env.example` in the Vercel dashboard under Project Settings → Environment Variables.

## Deploy with Docker

```bash
docker build -t suicert .
docker run -p 3000:3000 --env-file .env.local suicert
```

## Deploy with Docker Compose

```yaml
version: "3.9"
services:
  suicert:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4 |
| Auth | NextAuth v5 (Google OAuth → zkLogin) |
| Blockchain | Sui Move (SBTs), Wormhole (bridge) |
| Real-time | Ably WebSockets |
| Database | Supabase (PostgreSQL + RLS) |
| Storage | Pinata (IPFS) |
| AI | Claude Opus (`@anthropic-ai/sdk`) |
| Validation | Zod v4 |

---

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm run type-check   # TypeScript check only
npm run test:webhook # Simulate Meet webhook: node scripts/test-webhook.js --event all
```

---

## License

MIT — Built for SUICERT 2026.
