#!/usr/bin/env node
// scripts/check-services.js
// Validates all configured services and shows what's active vs mock
// Usage: node scripts/check-services.js

const fs   = require("fs");
const path = require("path");
const http = require("http");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
};

const ENV_FILE = path.resolve(__dirname, "../.env.local");

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return fs.readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .reduce((acc, line) => {
      const idx = line.indexOf("=");
      acc[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      return acc;
    }, {});
}

function isReal(val) {
  return val && !val.startsWith("REPLACE") && val !== "";
}

function checkLibFile(filePath, productionMarker) {
  if (!fs.existsSync(filePath)) return "missing";
  const content = fs.readFileSync(filePath, "utf8");
  return content.includes(productionMarker) ? "mock" : "production";
}

async function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => {
        try { resolve({ ok: true, data: JSON.parse(data) }); }
        catch { resolve({ ok: res.statusCode === 200, data: null }); }
      });
    });
    req.on("error", () => resolve({ ok: false, data: null }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, data: null }); });
  });
}

function status(active, label, detail = "") {
  if (active === "real") {
    console.log(`  ${C.green}✓  LIVE${C.reset}   ${C.bold}${label}${C.reset}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`);
  } else if (active === "mock") {
    console.log(`  ${C.yellow}~  MOCK${C.reset}   ${label}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`);
  } else {
    console.log(`  ${C.red}✗  MISS${C.reset}   ${label}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`);
  }
}

async function main() {
  console.log(`\n${C.bold}${C.cyan}  SUICERT — Service Status Check${C.reset}\n`);

  const env = readEnv();
  const ROOT = path.resolve(__dirname, "..");

  // ── Env file ──────────────────────────────────────────────────────────────
  if (!fs.existsSync(ENV_FILE)) {
    console.log(`  ${C.red}✗  .env.local not found${C.reset}`);
    console.log(`  Run: ${C.cyan}node scripts/setup.js${C.reset}\n`);
    return;
  }
  console.log(`  ${C.green}✓${C.reset}  .env.local found\n`);

  // ── Auth ──────────────────────────────────────────────────────────────────
  console.log(`${C.bold}  Authentication${C.reset}`);
  status(isReal(env.NEXTAUTH_SECRET) ? "real" : "miss", "NEXTAUTH_SECRET",
    isReal(env.NEXTAUTH_SECRET) ? env.NEXTAUTH_SECRET.slice(0, 8) + "..." : "run: openssl rand -base64 32");
  status(isReal(env.GOOGLE_CLIENT_ID) ? "real" : "mock", "Google OAuth",
    isReal(env.GOOGLE_CLIENT_ID) ? env.GOOGLE_CLIENT_ID.slice(0, 20) + "..." : "sign-in disabled");
  console.log();

  // ── Database ──────────────────────────────────────────────────────────────
  console.log(`${C.bold}  Database${C.reset}`);
  const supabaseMode = checkLibFile(
    path.join(ROOT, "lib/supabase/index.ts"),
    "// import { createClient }"
  );
  status(
    isReal(env.NEXT_PUBLIC_SUPABASE_URL) ? "real" : "mock",
    "Supabase",
    isReal(env.NEXT_PUBLIC_SUPABASE_URL)
      ? `${env.NEXT_PUBLIC_SUPABASE_URL.slice(0, 30)}... (uncomment lib/supabase/index.ts)`
      : "using in-memory mock data"
  );
  console.log();

  // ── Real-time ─────────────────────────────────────────────────────────────
  console.log(`${C.bold}  Real-time${C.reset}`);
  status(
    isReal(env.ABLY_API_KEY) ? "real" : "mock",
    "Ably WebSockets",
    isReal(env.ABLY_API_KEY)
      ? env.ABLY_API_KEY.split(":")[0] + " (uncomment lib/ably/index.ts)"
      : "simulated progress updates (3s intervals)"
  );
  console.log();

  // ── AI ────────────────────────────────────────────────────────────────────
  console.log(`${C.bold}  AI${C.reset}`);
  status(
    isReal(env.ANTHROPIC_API_KEY) ? "real" : "mock",
    "Claude Opus (Anthropic)",
    isReal(env.ANTHROPIC_API_KEY)
      ? env.ANTHROPIC_API_KEY.slice(0, 20) + "... (uncomment lib/ai/index.ts)"
      : "deterministic mock scoring"
  );
  console.log();

  // ── Blockchain ────────────────────────────────────────────────────────────
  console.log(`${C.bold}  Blockchain${C.reset}`);
  const suiReal = isReal(env.SUI_PACKAGE_ID) && !env.SUI_PACKAGE_ID.includes("REPLACE");
  status(
    suiReal ? "real" : "mock",
    "Sui (SBT Minting)",
    suiReal
      ? `${env.SUI_NETWORK} — ${env.SUI_PACKAGE_ID.slice(0, 20)}... (uncomment lib/sui/index.ts)`
      : "mock object IDs — run: node scripts/publish-contract.js"
  );
  status(
    isReal(env.SUI_ADMIN_PRIVATE_KEY) && !env.SUI_ADMIN_PRIVATE_KEY.includes("REPLACE") ? "real" : "mock",
    "Admin Keypair",
    isReal(env.SUI_ADMIN_PRIVATE_KEY) && !env.SUI_ADMIN_PRIVATE_KEY.includes("REPLACE")
      ? env.SUI_ADMIN_PRIVATE_KEY.slice(0, 8) + "..."
      : "run: node scripts/export-key.js"
  );
  console.log();

  // ── IPFS ──────────────────────────────────────────────────────────────────
  console.log(`${C.bold}  Storage${C.reset}`);
  status(
    isReal(env.PINATA_API_KEY) ? "real" : "mock",
    "Pinata IPFS",
    isReal(env.PINATA_API_KEY) ? "metadata will be pinned on-chain" : "mock IPFS hashes"
  );
  console.log();

  // ── Live server check ─────────────────────────────────────────────────────
  console.log(`${C.bold}  Dev Server${C.reset}`);
  const health = await checkUrl("http://localhost:3000/api/health");
  if (health.ok && health.data) {
    console.log(`  ${C.green}✓  RUNNING${C.reset}  http://localhost:3000`);
    const s = health.data.services || {};
    const active = Object.entries(s).filter(([,v]) => v).map(([k]) => k);
    const inactive = Object.entries(s).filter(([,v]) => !v).map(([k]) => k);
    if (active.length)   console.log(`  ${C.dim}  Active:   ${active.join(", ")}${C.reset}`);
    if (inactive.length) console.log(`  ${C.dim}  Inactive: ${inactive.join(", ")}${C.reset}`);
  } else {
    console.log(`  ${C.yellow}~  NOT RUNNING${C.reset}  Start with: npm run dev`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const hasAllKeys = [
    env.NEXTAUTH_SECRET,
    env.GOOGLE_CLIENT_ID,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.ABLY_API_KEY,
    env.ANTHROPIC_API_KEY,
    env.SUI_PACKAGE_ID,
  ].every(v => isReal(v) && v && !v.includes("REPLACE"));

  console.log();
  if (hasAllKeys) {
    console.log(`  ${C.green}${C.bold}All services configured — ready for production!${C.reset}`);
  } else {
    console.log(`  ${C.yellow}App runs with mocks for unconfigured services.${C.reset}`);
    console.log(`  ${C.dim}Run node scripts/setup.js to add missing keys.${C.reset}`);
  }
  console.log();
}

main().catch(e => console.error(e.message));
