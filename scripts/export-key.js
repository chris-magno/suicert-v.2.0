#!/usr/bin/env node
// scripts/export-key.js
// Exports your Sui wallet private key as hex and saves to .env.local
// Usage: node scripts/export-key.js

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
};

function run(cmd) {
  try { return execSync(cmd, { stdio: "pipe" }).toString().trim(); }
  catch (e) { return null; }
}

function updateEnvFile(key, value) {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, "");
  }
  let content = fs.readFileSync(envPath, "utf8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(envPath, content);
}

async function main() {
  console.log(`\n${C.bold}${C.cyan}  SUICERT — Export Sui Private Key${C.reset}\n`);

  // Check Sui CLI
  const suiVer = run("sui --version");
  if (!suiVer) {
    console.error(`${C.red}  Sui CLI not found. Install it first.${C.reset}`);
    process.exit(1);
  }

  const address = run("sui client active-address");
  if (!address) {
    console.error(`${C.red}  No active Sui address. Run: sui client new-address ed25519${C.reset}`);
    process.exit(1);
  }

  console.log(`  ${C.dim}Active address:${C.reset} ${address}`);

  // Get key from keystore
  const keystorePath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    ".sui/sui_config/sui.keystore"
  );

  if (!fs.existsSync(keystorePath)) {
    console.error(`${C.red}  Keystore not found at: ${keystorePath}${C.reset}`);
    process.exit(1);
  }

  let keystore;
  try {
    keystore = JSON.parse(fs.readFileSync(keystorePath, "utf8"));
  } catch {
    console.error(`${C.red}  Could not parse keystore${C.reset}`);
    process.exit(1);
  }

  if (!Array.isArray(keystore) || keystore.length === 0) {
    console.error(`${C.red}  No keys in keystore${C.reset}`);
    process.exit(1);
  }

  // The keystore is an array of base64-encoded keypairs
  // Each entry is: [flag_byte (1)] + [private_key (32)] + [public_key (32)]
  // Flag byte: 0x00 = Ed25519, 0x01 = Secp256k1, 0x02 = Secp256r1

  let hexKey = null;
  for (const b64 of keystore) {
    try {
      const buf = Buffer.from(b64, "base64");
      // Skip the 1-byte flag, take next 32 bytes as private key
      const privateKey = buf.slice(1, 33);
      const hexCandidate = privateKey.toString("hex");
      if (hexCandidate.length === 64) {
        hexKey = hexCandidate;
        break;
      }
    } catch {}
  }

  if (!hexKey) {
    console.log(`\n${C.yellow}  Could not auto-extract key. Manual steps:${C.reset}`);
    console.log(`\n  1. Run: ${C.cyan}sui keytool export --key-identity ${address}${C.reset}`);
    console.log(`  2. Copy the exported key`);
    console.log(`  3. Convert base64 to hex with:`);
    console.log(`     ${C.cyan}node -e "const b='YOUR_BASE64'; const buf=Buffer.from(b,'base64'); console.log(buf.slice(1).toString('hex'))"${C.reset}`);
    console.log(`  4. Add to .env.local: SUI_ADMIN_PRIVATE_KEY=<hex>\n`);
    process.exit(1);
  }

  // Save to .env.local
  updateEnvFile("SUI_ADMIN_PRIVATE_KEY", hexKey);

  console.log(`\n  ${C.green}✓${C.reset}  Private key saved to .env.local`);
  console.log(`  ${C.dim}Key (first 8 chars): ${hexKey.slice(0, 8)}...${hexKey.slice(-8)}${C.reset}`);
  console.log(`\n  ${C.yellow}⚠  NEVER share or commit your private key.${C.reset}`);
  console.log(`  ${C.dim}It controls all certificate minting on SUICERT.${C.reset}\n`);

  // Reminder to uncomment Sui production code
  const suiLib = path.resolve(__dirname, "../lib/sui/index.ts");
  const suiContent = fs.readFileSync(suiLib, "utf8");
  if (suiContent.includes("// import { Transaction }")) {
    console.log(`  ${C.yellow}Next:${C.reset} Uncomment the production block in ${C.cyan}lib/sui/index.ts${C.reset}`);
    console.log(`  Lines 14–59: remove the // prefix from each line in the production section.\n`);
  }
}

main().catch(e => {
  console.error(`\n  ${C.red}Error: ${e.message}${C.reset}\n`);
  process.exit(1);
});
