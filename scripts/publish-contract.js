#!/usr/bin/env node
// scripts/publish-contract.js
// Publishes the SUICERT Move contract to devnet or mainnet
// and automatically updates .env.local with the deployed addresses.
// Usage: node scripts/publish-contract.js [--network devnet|mainnet]

const { execSync } = require("child_process");
const fs   = require("path");
const path = require("path");
const fsp  = require("fs");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
};
const ok   = (m) => console.log(`${C.green}  ✓  ${C.reset}${m}`);
const warn = (m) => console.log(`${C.yellow}  ⚠  ${C.reset}${m}`);
const err  = (m) => console.log(`${C.red}  ✗  ${C.reset}${m}`);
const info = (m) => console.log(`${C.cyan}  →  ${C.reset}${m}`);
const head = (m) => console.log(`\n${C.bold}${m}${C.reset}`);

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: "pipe", ...opts }).toString().trim();
  } catch (e) {
    return null;
  }
}

function updateEnvFile(updates) {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fsp.existsSync(envPath)) {
    warn(".env.local not found — creating it");
    fsp.writeFileSync(envPath, "");
  }
  let content = fsp.readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  fsp.writeFileSync(envPath, content);
}

async function main() {
  console.clear();
  console.log(`
${C.bold}${C.cyan}
  ╔══════════════════════════════════════════╗
  ║    SUICERT — Move Contract Publisher     ║
  ╚══════════════════════════════════════════╝
${C.reset}`);

  // Parse --network flag
  const args    = process.argv.slice(2);
  const netFlag = args.indexOf("--network");
  const network = netFlag !== -1 ? args[netFlag + 1] : null;
  const MOVE_DIR = path.resolve(__dirname, "../move/suicert");

  // ── Check Sui CLI ─────────────────────────────────────────────────────────
  head("1. Checking Sui CLI");
  const suiVer = run("sui --version");
  if (!suiVer) {
    err("Sui CLI not found.");
    console.log(`
  Install it with:
    ${C.cyan}cargo install --locked --git https://github.com/MystenLabs/sui.git sui${C.reset}
  Or on macOS:
    ${C.cyan}brew install sui${C.reset}
`);
    process.exit(1);
  }
  ok(`Sui CLI: ${suiVer}`);

  // ── Check active env ──────────────────────────────────────────────────────
  head("2. Network configuration");
  const activeEnv    = run("sui client active-env");
  const activeAddr   = run("sui client active-address");
  const targetNetwork = network || activeEnv || "devnet";

  info(`Active environment: ${activeEnv || "none"}`);
  info(`Active address:     ${activeAddr || "none"}`);
  info(`Target network:     ${targetNetwork}`);

  // Switch network if needed
  if (activeEnv !== targetNetwork) {
    info(`Switching to ${targetNetwork}...`);
    const switchResult = run(`sui client switch --env ${targetNetwork}`);
    if (!switchResult && switchResult !== "") {
      // Try creating the env first
      if (targetNetwork === "devnet") {
        run("sui client new-env --alias devnet --rpc https://fullnode.devnet.sui.io:443");
      } else if (targetNetwork === "mainnet") {
        run("sui client new-env --alias mainnet --rpc https://fullnode.mainnet.sui.io:443");
      } else if (targetNetwork === "testnet") {
        run("sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443");
      }
      run(`sui client switch --env ${targetNetwork}`);
    }
    ok(`Switched to ${targetNetwork}`);
  }

  // ── Check balance ─────────────────────────────────────────────────────────
  head("3. Checking wallet balance");
  const balanceOutput = run("sui client balance");
  console.log(`${C.dim}${balanceOutput || "Could not fetch balance"}${C.reset}`);

  if (targetNetwork === "devnet") {
    info("Getting devnet SUI from faucet...");
    const faucet = run("sui client faucet");
    if (faucet) ok("Faucet request sent — balance will update shortly");
    else warn("Faucet request failed — you may already have enough SUI");
    // Wait a moment for faucet
    await new Promise(r => setTimeout(r, 3000));
  }

  // ── Build contract ────────────────────────────────────────────────────────
  head("4. Building Move contract");
  info("Running: sui move build");
  try {
    execSync("sui move build", { cwd: MOVE_DIR, stdio: "inherit" });
    ok("Build successful");
  } catch (e) {
    err("Build failed — check Move source files");
    process.exit(1);
  }

  // ── Run tests ─────────────────────────────────────────────────────────────
  head("5. Running Move tests");
  info("Running: sui move test");
  try {
    execSync("sui move test", { cwd: MOVE_DIR, stdio: "inherit" });
    ok("All tests passed");
  } catch (e) {
    err("Tests failed — fix before publishing");
    const force = process.argv.includes("--force");
    if (!force) {
      console.log(`\n  Use ${C.cyan}--force${C.reset} to publish anyway (not recommended)`);
      process.exit(1);
    }
    warn("Publishing anyway due to --force flag");
  }

  // ── Publish ───────────────────────────────────────────────────────────────
  head("6. Publishing contract");
  info(`Publishing to ${targetNetwork}...`);

  let publishOutput;
  try {
    publishOutput = execSync(
      "sui client publish --gas-budget 200000000 --json",
      { cwd: MOVE_DIR, stdio: "pipe" }
    ).toString();
    ok("Transaction submitted");
  } catch (e) {
    err("Publish failed:");
    console.log(e.stdout?.toString() || e.message);
    process.exit(1);
  }

  // ── Parse output ──────────────────────────────────────────────────────────
  head("7. Extracting deployed addresses");

  let packageId    = null;
  let adminCapId   = null;
  let registryId   = null;
  let digest       = null;

  try {
    const parsed = JSON.parse(publishOutput);
    digest = parsed.digest;

    const changes = parsed.objectChanges || [];

    // Package ID — type "published"
    const pkg = changes.find(c => c.type === "published");
    if (pkg) packageId = pkg.packageId;

    // AdminCap — owned by sender
    const adminCap = changes.find(c =>
      c.type === "created" &&
      c.objectType?.includes("::soulbound::AdminCap") &&
      c.owner?.AddressOwner
    );
    if (adminCap) adminCapId = adminCap.objectId;

    // GlobalRegistry — shared object
    const registry = changes.find(c =>
      c.type === "created" &&
      c.objectType?.includes("::soulbound::GlobalRegistry")
    );
    if (registry) registryId = registry.objectId;

  } catch (e) {
    warn("Could not parse JSON output — attempting regex extraction");

    // Fallback: regex parse
    const pkgMatch  = publishOutput.match(/"packageId":\s*"(0x[a-f0-9]+)"/i);
    const capMatch  = publishOutput.match(/AdminCap[\s\S]{0,200}"objectId":\s*"(0x[a-f0-9]+)"/i);
    const regMatch  = publishOutput.match(/GlobalRegistry[\s\S]{0,200}"objectId":\s*"(0x[a-f0-9]+)"/i);

    if (pkgMatch)  packageId  = pkgMatch[1];
    if (capMatch)  adminCapId = capMatch[1];
    if (regMatch)  registryId = regMatch[1];
  }

  // Save raw output for reference
  const outFile = path.resolve(MOVE_DIR, `publish-${targetNetwork}-${Date.now()}.json`);
  fsp.writeFileSync(outFile, publishOutput);
  info(`Raw output saved to: ${path.relative(process.cwd(), outFile)}`);

  if (!packageId) {
    err("Could not extract Package ID from publish output");
    console.log("\n  Manual steps:");
    console.log(`  1. Check: ${outFile}`);
    console.log("  2. Find the 'published' objectChange entry");
    console.log("  3. Manually set SUI_PACKAGE_ID, SUI_ADMIN_CAP_ID, SUI_GLOBAL_REGISTRY_ID in .env.local");
    process.exit(1);
  }

  ok(`Package ID:        ${packageId}`);
  if (adminCapId) ok(`Admin Cap ID:      ${adminCapId}`);
  else warn("AdminCap ID not found — check publish output manually");
  if (registryId) ok(`Global Registry:   ${registryId}`);
  else warn("GlobalRegistry ID not found — check publish output manually");
  if (digest) ok(`Transaction:       ${digest}`);

  // ── Update .env.local ─────────────────────────────────────────────────────
  head("8. Updating .env.local");

  const updates = { SUI_NETWORK: targetNetwork };
  if (packageId)  updates.SUI_PACKAGE_ID          = packageId;
  if (adminCapId) updates.SUI_ADMIN_CAP_ID         = adminCapId;
  if (registryId) updates.SUI_GLOBAL_REGISTRY_ID   = registryId;

  updateEnvFile(updates);
  ok(".env.local updated with deployed addresses");

  // ── Also update Move.toml with package address ────────────────────────────
  if (packageId) {
    const moveToml = path.join(MOVE_DIR, "Move.toml");
    let tomlContent = fsp.readFileSync(moveToml, "utf8");
    tomlContent = tomlContent.replace(
      /^suicert = "0x0"$/m,
      `suicert = "${packageId}"`
    );
    fsp.writeFileSync(moveToml, tomlContent);
    ok("Move.toml updated with package address");
  }

  // ── Final instructions ────────────────────────────────────────────────────
  console.log(`
${C.green}${C.bold}
  ╔══════════════════════════════════════════╗
  ║       Contract Published! 🎉             ║
  ╚══════════════════════════════════════════╝
${C.reset}`);

  console.log(`  ${C.bold}Deployed to:${C.reset} ${targetNetwork}`);
  if (packageId)  console.log(`  ${C.bold}Package:${C.reset}     ${C.cyan}${packageId}${C.reset}`);
  if (adminCapId) console.log(`  ${C.bold}Admin Cap:${C.reset}   ${C.cyan}${adminCapId}${C.reset}`);
  if (registryId) console.log(`  ${C.bold}Registry:${C.reset}    ${C.cyan}${registryId}${C.reset}`);

  if (targetNetwork !== "mainnet") {
    console.log(`\n  ${C.dim}View on explorer:${C.reset}`);
    console.log(`  ${C.cyan}https://suiscan.xyz/${targetNetwork}/object/${packageId}${C.reset}`);
  }

  console.log(`\n  ${C.bold}Next:${C.reset}`);
  console.log(`  1. Export your private key: ${C.cyan}node scripts/export-key.js${C.reset}`);
  console.log(`  2. Uncomment production code in lib/sui/index.ts`);
  console.log(`  3. Restart dev server: ${C.cyan}npm run dev${C.reset}`);
  console.log(`  4. Test: ${C.cyan}http://localhost:3000/api/health${C.reset}\n`);
}

main().catch(e => {
  console.error(`\n  ${C.red}Error: ${e.message}${C.reset}\n`);
  process.exit(1);
});
