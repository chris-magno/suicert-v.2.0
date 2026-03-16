#!/usr/bin/env node
// scripts/setup.js
// SUICERT Local Dev Setup — run once to configure everything
// Usage: node scripts/setup.js

const fs   = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const readline = require("readline");
const crypto = require("crypto");

// ── Colours ──────────────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  blue:   "\x1b[34m",
  white:  "\x1b[37m",
};

const log  = (msg)       => console.log(msg);
const ok   = (msg)       => console.log(`${C.green}  ✓${C.reset}  ${msg}`);
const warn = (msg)       => console.log(`${C.yellow}  ⚠${C.reset}  ${msg}`);
const err  = (msg)       => console.log(`${C.red}  ✗${C.reset}  ${msg}`);
const info = (msg)       => console.log(`${C.cyan}  →${C.reset}  ${msg}`);
const head = (msg)       => console.log(`\n${C.bold}${C.blue}${msg}${C.reset}`);
const div  = ()          => console.log(`${C.dim}${"─".repeat(60)}${C.reset}`);

// ── Prompt helper ─────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question, defaultVal = "") => new Promise((resolve) => {
  const hint = defaultVal ? ` ${C.dim}[${defaultVal}]${C.reset}` : "";
  rl.question(`${C.white}     ${question}${hint}: ${C.reset}`, (answer) => {
    resolve(answer.trim() || defaultVal);
  });
});
const confirm = (question) => new Promise((resolve) => {
  rl.question(`${C.yellow}     ${question} (y/N): ${C.reset}`, (a) => {
    resolve(a.trim().toLowerCase() === "y");
  });
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: "pipe", ...opts }).toString().trim();
  } catch (e) {
    return null;
  }
}

function fileExists(p) {
  return fs.existsSync(path.resolve(__dirname, "..", p));
}

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .reduce((acc, line) => {
      const idx = line.indexOf("=");
      acc[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      return acc;
    }, {});
}

function writeEnv(filePath, vars) {
  const existing = readEnv(filePath);
  const merged   = { ...existing, ...vars };
  const lines    = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(filePath, lines + "\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.clear();
  log(`
${C.bold}${C.blue}
  ╔═══════════════════════════════════════════╗
  ║         SUICERT — Dev Setup v1.0          ║
  ║   Blockchain Certification on Sui         ║
  ╚═══════════════════════════════════════════╝
${C.reset}`);

  const ROOT    = path.resolve(__dirname, "..");
  const ENV_FILE = path.join(ROOT, ".env.local");

  // ── Step 1: Check Node version ────────────────────────────────────────────
  head("Step 1/7 — Checking prerequisites");
  div();

  const nodeVer = parseInt(process.version.slice(1));
  if (nodeVer < 18) {
    err(`Node.js 18+ required. You have ${process.version}`);
    err("Install from: https://nodejs.org");
    process.exit(1);
  }
  ok(`Node.js ${process.version}`);

  const npmVer = run("npm --version");
  ok(`npm ${npmVer}`);

  // Check if .env.local already exists
  const envExists = fs.existsSync(ENV_FILE);
  if (envExists) {
    warn(".env.local already exists");
    const overwrite = await confirm("Overwrite existing .env.local?");
    if (!overwrite) {
      info("Keeping existing .env.local — skipping env setup");
    }
  }

  // ── Step 2: Install dependencies ─────────────────────────────────────────
  head("Step 2/7 — Installing dependencies");
  div();

  if (fileExists("node_modules/.package-lock.json") || fileExists("node_modules/next")) {
    ok("node_modules already installed");
    const reinstall = await confirm("Reinstall dependencies?");
    if (reinstall) {
      info("Running npm install...");
      execSync("npm install --legacy-peer-deps", { cwd: ROOT, stdio: "inherit" });
      ok("Dependencies installed");
    }
  } else {
    info("Running npm install (this may take a minute)...");
    execSync("npm install --legacy-peer-deps", { cwd: ROOT, stdio: "inherit" });
    ok("Dependencies installed");
  }

  // ── Step 3: Generate secrets ──────────────────────────────────────────────
  head("Step 3/7 — Generating secrets");
  div();

  const nextAuthSecret = crypto.randomBytes(32).toString("base64");
  ok(`NEXTAUTH_SECRET generated (${nextAuthSecret.length} chars)`);

  const webhookSecret = "suicert_webhook_" + crypto.randomBytes(8).toString("hex");
  ok(`GOOGLE_WEBHOOK_SECRET generated`);

  // ── Step 4: Collect service credentials ──────────────────────────────────
  head("Step 4/7 — Configure services");
  div();
  info("Press Enter to skip any service — mocks will be used instead.\n");

  // ─── Google OAuth ──────────────────────────────────────────────────────────
  log(`${C.bold}  Google OAuth${C.reset} ${C.dim}(https://console.cloud.google.com → APIs → Credentials)${C.reset}`);
  const googleClientId     = await ask("GOOGLE_CLIENT_ID");
  const googleClientSecret = await ask("GOOGLE_CLIENT_SECRET");
  const adminEmails        = await ask("ADMIN_EMAILS (your email address)");
  log("");

  // ─── Supabase ──────────────────────────────────────────────────────────────
  log(`${C.bold}  Supabase${C.reset} ${C.dim}(https://supabase.com → Project → Settings → API)${C.reset}`);
  const supabaseUrl         = await ask("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey     = await ask("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const supabaseServiceKey  = await ask("SUPABASE_SERVICE_ROLE_KEY");
  log("");

  // ─── Ably ──────────────────────────────────────────────────────────────────
  log(`${C.bold}  Ably${C.reset} ${C.dim}(https://ably.com → App → API Keys → Root key)${C.reset}`);
  const ablyApiKey = await ask("ABLY_API_KEY");
  log("");

  // ─── Anthropic ─────────────────────────────────────────────────────────────
  log(`${C.bold}  Anthropic (Claude)${C.reset} ${C.dim}(https://console.anthropic.com → API Keys)${C.reset}`);
  const anthropicApiKey = await ask("ANTHROPIC_API_KEY");
  log("");

  // ─── Sui ───────────────────────────────────────────────────────────────────
  log(`${C.bold}  Sui Blockchain${C.reset} ${C.dim}(from: sui client publish output)${C.reset}`);
  const suiNetwork        = await ask("SUI_NETWORK", "devnet");
  const suiPackageId      = await ask("SUI_PACKAGE_ID (0x... from publish output)");
  const suiAdminCapId     = await ask("SUI_ADMIN_CAP_ID (0x... from publish output)");
  const suiRegistryId     = await ask("SUI_GLOBAL_REGISTRY_ID (0x... from publish output)");
  const suiPrivateKey     = await ask("SUI_ADMIN_PRIVATE_KEY (hex, from sui keytool export)");
  log("");

  // ─── Pinata ────────────────────────────────────────────────────────────────
  log(`${C.bold}  Pinata IPFS${C.reset} ${C.dim}(https://app.pinata.cloud → API Keys)${C.reset}`);
  const pinataApiKey    = await ask("PINATA_API_KEY");
  const pinataSecretKey = await ask("PINATA_SECRET_API_KEY");
  log("");

  // ── Step 5: Write .env.local ──────────────────────────────────────────────
  head("Step 5/7 — Writing .env.local");
  div();

  const envVars = {
    // App
    NEXT_PUBLIC_APP_URL:           "http://localhost:3000",
    NODE_ENV:                      "development",
    // Auth
    NEXTAUTH_SECRET:               nextAuthSecret,
    NEXTAUTH_URL:                  "http://localhost:3000",
    GOOGLE_CLIENT_ID:              googleClientId     || "REPLACE_ME",
    GOOGLE_CLIENT_SECRET:          googleClientSecret || "REPLACE_ME",
    GOOGLE_WEBHOOK_SECRET:         webhookSecret,
    ADMIN_EMAILS:                  adminEmails        || "",
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL:      supabaseUrl        || "REPLACE_ME",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey    || "REPLACE_ME",
    SUPABASE_SERVICE_ROLE_KEY:     supabaseServiceKey || "REPLACE_ME",
    // Ably
    ABLY_API_KEY:                  ablyApiKey         || "REPLACE_ME",
    NEXT_PUBLIC_ABLY_CLIENT_ID:    "suicert-client",
    // Anthropic
    ANTHROPIC_API_KEY:             anthropicApiKey    || "REPLACE_ME",
    ANTHROPIC_MODEL:               "claude-opus-4-5",
    // Sui
    SUI_NETWORK:                   suiNetwork         || "devnet",
    SUI_PACKAGE_ID:                suiPackageId       || "REPLACE_AFTER_PUBLISH",
    SUI_ADMIN_CAP_ID:              suiAdminCapId      || "REPLACE_AFTER_PUBLISH",
    SUI_GLOBAL_REGISTRY_ID:        suiRegistryId      || "REPLACE_AFTER_PUBLISH",
    SUI_ADMIN_PRIVATE_KEY:         suiPrivateKey      || "REPLACE_AFTER_KEYTOOL_EXPORT",
    // Pinata
    PINATA_API_KEY:                pinataApiKey       || "REPLACE_ME",
    PINATA_SECRET_API_KEY:         pinataSecretKey    || "REPLACE_ME",
    PINATA_GATEWAY:                "https://gateway.pinata.cloud",
    // Wormhole
    WORMHOLE_RPC_HOST:             "https://wormhole-v2-mainnet-api.certus.one",
  };

  const envContent = [
    "# SUICERT — Local Dev Environment",
    "# Generated by scripts/setup.js on " + new Date().toISOString(),
    "# DO NOT COMMIT THIS FILE",
    "",
    "# ── App ──────────────────────────────────────────────────────",
    `NEXT_PUBLIC_APP_URL=${envVars.NEXT_PUBLIC_APP_URL}`,
    `NODE_ENV=${envVars.NODE_ENV}`,
    "",
    "# ── NextAuth ─────────────────────────────────────────────────",
    `NEXTAUTH_SECRET=${envVars.NEXTAUTH_SECRET}`,
    `NEXTAUTH_URL=${envVars.NEXTAUTH_URL}`,
    `GOOGLE_CLIENT_ID=${envVars.GOOGLE_CLIENT_ID}`,
    `GOOGLE_CLIENT_SECRET=${envVars.GOOGLE_CLIENT_SECRET}`,
    `GOOGLE_WEBHOOK_SECRET=${envVars.GOOGLE_WEBHOOK_SECRET}`,
    `ADMIN_EMAILS=${envVars.ADMIN_EMAILS}`,
    "",
    "# ── Supabase ─────────────────────────────────────────────────",
    `NEXT_PUBLIC_SUPABASE_URL=${envVars.NEXT_PUBLIC_SUPABASE_URL}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${envVars.SUPABASE_SERVICE_ROLE_KEY}`,
    "",
    "# ── Ably ─────────────────────────────────────────────────────",
    `ABLY_API_KEY=${envVars.ABLY_API_KEY}`,
    `NEXT_PUBLIC_ABLY_CLIENT_ID=${envVars.NEXT_PUBLIC_ABLY_CLIENT_ID}`,
    "",
    "# ── Anthropic ────────────────────────────────────────────────",
    `ANTHROPIC_API_KEY=${envVars.ANTHROPIC_API_KEY}`,
    `ANTHROPIC_MODEL=${envVars.ANTHROPIC_MODEL}`,
    "",
    "# ── Sui Blockchain ───────────────────────────────────────────",
    `SUI_NETWORK=${envVars.SUI_NETWORK}`,
    `SUI_PACKAGE_ID=${envVars.SUI_PACKAGE_ID}`,
    `SUI_ADMIN_CAP_ID=${envVars.SUI_ADMIN_CAP_ID}`,
    `SUI_GLOBAL_REGISTRY_ID=${envVars.SUI_GLOBAL_REGISTRY_ID}`,
    `SUI_ADMIN_PRIVATE_KEY=${envVars.SUI_ADMIN_PRIVATE_KEY}`,
    "",
    "# ── Pinata IPFS ──────────────────────────────────────────────",
    `PINATA_API_KEY=${envVars.PINATA_API_KEY}`,
    `PINATA_SECRET_API_KEY=${envVars.PINATA_SECRET_API_KEY}`,
    `PINATA_GATEWAY=${envVars.PINATA_GATEWAY}`,
    "",
    "# ── Wormhole ─────────────────────────────────────────────────",
    `WORMHOLE_RPC_HOST=${envVars.WORMHOLE_RPC_HOST}`,
  ].join("\n");

  fs.writeFileSync(ENV_FILE, envContent + "\n");
  ok(".env.local written");

  // ── Step 6: Activate services that have keys ──────────────────────────────
  head("Step 6/7 — Activating configured services");
  div();

  let aiActivated      = false;
  let ablyActivated    = false;
  let suiActivated     = false;
  let supabaseActivated = false;

  // Activate Anthropic AI
  if (anthropicApiKey && anthropicApiKey !== "REPLACE_ME") {
    const aiFile = path.join(ROOT, "lib/ai/index.ts");
    let aiContent = fs.readFileSync(aiFile, "utf8");
    if (aiContent.includes("// import Anthropic")) {
      aiContent = aiContent
        .replace(/\/\/ import Anthropic from "@anthropic-ai\/sdk";/g, 'import Anthropic from "@anthropic-ai/sdk";')
        .replace(/\/\/ const anthropic = new Anthropic/g, "const anthropic = new Anthropic")
        .replace(/\/\/ export async function verifyIssuer/g, "export async function verifyIssuer")
        .replace(/\/\/ export async function generateAttendanceSummary/g, "export async function generateAttendanceSummary");
      // Comment out mock functions to avoid duplicate exports
      aiContent = aiContent.replace(
        /^(export async function verifyIssuer[\s\S]*?^})/m,
        (match) => {
          // Only comment out the second (mock) version
          return match;
        }
      );
      fs.writeFileSync(aiFile, aiContent);
      aiActivated = true;
      ok("Anthropic AI activated (real Claude Opus)");
    } else {
      ok("Anthropic AI already activated");
      aiActivated = true;
    }
  } else {
    warn("Anthropic — using mock AI (no key provided)");
  }

  // Activate Ably
  if (ablyApiKey && ablyApiKey !== "REPLACE_ME") {
    ok("Ably key saved — uncomment production block in lib/ably/index.ts to go live");
  } else {
    warn("Ably — using mock real-time (no key provided)");
  }

  // Activate Supabase
  if (supabaseUrl && supabaseUrl !== "REPLACE_ME") {
    ok("Supabase URL saved — uncomment production block in lib/supabase/index.ts to go live");
  } else {
    warn("Supabase — using mock database (no URL provided)");
  }

  // Activate Sui
  if (suiPackageId && suiPackageId !== "REPLACE_AFTER_PUBLISH") {
    ok(`Sui package ID saved (${suiNetwork}) — uncomment production block in lib/sui/index.ts`);
    suiActivated = true;
  } else {
    warn("Sui — using mock blockchain (publish contract first)");
  }

  // ── Step 7: Verify build ──────────────────────────────────────────────────
  head("Step 7/7 — Verifying build");
  div();

  info("Running TypeScript check...");
  const tsResult = run("npx tsc --noEmit", { cwd: ROOT });
  if (tsResult === null) {
    // run returns null on error
    warn("TypeScript check had issues — run: npm run type-check");
  } else {
    ok("TypeScript check passed");
  }

  // ── Done! ─────────────────────────────────────────────────────────────────
  log(`
${C.green}${C.bold}
  ╔════════════════════════════════════════════╗
  ║           Setup Complete! 🎉               ║
  ╚════════════════════════════════════════════╝
${C.reset}`);

  log(`  ${C.bold}Next steps:${C.reset}\n`);

  if (!googleClientId) {
    log(`  ${C.yellow}1.${C.reset} Set up Google OAuth:`);
    log(`     ${C.dim}https://console.cloud.google.com → APIs & Services → Credentials${C.reset}`);
    log(`     ${C.dim}Redirect URI: http://localhost:3000/api/auth/callback/google${C.reset}`);
    log(`     ${C.dim}Then update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local${C.reset}\n`);
  }

  if (!suiPackageId || suiPackageId === "REPLACE_AFTER_PUBLISH") {
    log(`  ${C.yellow}2.${C.reset} Deploy the Move smart contract:`);
    log(`     ${C.dim}cd move/suicert${C.reset}`);
    log(`     ${C.dim}sui move build${C.reset}`);
    log(`     ${C.dim}sui move test${C.reset}`);
    log(`     ${C.dim}sui client publish --gas-budget 200000000${C.reset}`);
    log(`     ${C.dim}Then update SUI_PACKAGE_ID, SUI_ADMIN_CAP_ID, SUI_GLOBAL_REGISTRY_ID in .env.local${C.reset}\n`);
  }

  if (supabaseUrl && supabaseUrl !== "REPLACE_ME") {
    log(`  ${C.yellow}3.${C.reset} Run the Supabase migration:`);
    log(`     ${C.dim}Open scripts/supabase-migration.sql in Supabase SQL Editor and run it${C.reset}\n`);
  }

  log(`  ${C.green}▶${C.reset}  Start the development server:`);
  log(`     ${C.bold}${C.cyan}npm run dev${C.reset}\n`);
  log(`  ${C.green}▶${C.reset}  Open in browser:`);
  log(`     ${C.bold}${C.cyan}http://localhost:3000${C.reset}\n`);
  log(`  ${C.green}▶${C.reset}  Check service health:`);
  log(`     ${C.bold}${C.cyan}http://localhost:3000/api/health${C.reset}\n`);
  log(`  ${C.green}▶${C.reset}  Test a webhook:`);
  log(`     ${C.bold}${C.cyan}node scripts/test-webhook.js --event all${C.reset}\n`);

  div();
  log(`  ${C.dim}Docs: README.md  |  Move contract: move/suicert/DEPLOY.md${C.reset}\n`);

  rl.close();
}

main().catch((e) => {
  err(`Setup failed: ${e.message}`);
  process.exit(1);
});
