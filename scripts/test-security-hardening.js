#!/usr/bin/env node
/**
 * Security hardening integration checks.
 *
 * Requires local dev server running (e.g. npm run dev).
 *
 * Tests:
 * 1) Unauthorized admin API access is blocked.
 * 2) Invalid wallet signature is rejected.
 * 3) Fake tx proof is rejected by Sui RPC verification.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADDRESS = (process.env.TEST_WALLET_ADDRESS || "0x" + "1".repeat(64)).toLowerCase();
const FAKE_SIG = process.env.TEST_FAKE_SIGNATURE || "A".repeat(64);
const FAKE_DIGEST = process.env.TEST_FAKE_DIGEST || "1111111111111111111111111111111111111111111";
const FAKE_CAP = process.env.TEST_FAKE_CAP || "0x" + "2".repeat(64);

async function jsonFetch(url, init = {}) {
  const res = await fetch(url, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { res, body };
}

async function testUnauthorizedAdminAccessBlocked() {
  const { res, body } = await jsonFetch(`${BASE_URL}/api/issuers`, { method: "GET" });
  if (res.status !== 403) {
    throw new Error(`Expected 403 for unauthorized issuer GET, got ${res.status} ${JSON.stringify(body)}`);
  }
  return "Unauthorized admin access blocked (GET /api/issuers -> 403)";
}

async function testInvalidSignatureRejected() {
  const challenge = await jsonFetch(`${BASE_URL}/api/wallet/session/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: ADDRESS }),
  });

  if (challenge.res.status !== 200 || !challenge.body?.nonce) {
    throw new Error(`Failed to get challenge: ${challenge.res.status} ${JSON.stringify(challenge.body)}`);
  }

  const login = await jsonFetch(`${BASE_URL}/api/wallet/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: ADDRESS, nonce: challenge.body.nonce, signature: FAKE_SIG }),
  });

  if (login.res.status !== 401) {
    throw new Error(`Expected 401 for invalid signature, got ${login.res.status} ${JSON.stringify(login.body)}`);
  }

  return "Invalid wallet signature rejected (POST /api/wallet/session -> 401)";
}

async function testFakeTxRejected() {
  const proof = await jsonFetch(`${BASE_URL}/api/issuers/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txDigest: FAKE_DIGEST, issuerCapId: FAKE_CAP }),
  });

  // Depending on auth state this can be 401 (no verified session) or 400 (failed chain verification).
  if (![400, 401].includes(proof.res.status)) {
    throw new Error(`Expected 400/401 for fake proof, got ${proof.res.status} ${JSON.stringify(proof.body)}`);
  }

  return `Fake tx proof rejected (POST /api/issuers/proof -> ${proof.res.status})`;
}

(async function run() {
  console.log("\\n=== SUICERT Security Hardening Checks ===");
  console.log(`Target: ${BASE_URL}`);

  const tests = [
    testUnauthorizedAdminAccessBlocked,
    testInvalidSignatureRejected,
    testFakeTxRejected,
  ];

  const passed = [];
  const failed = [];

  for (const testFn of tests) {
    try {
      const msg = await testFn();
      passed.push(msg);
      console.log(`PASS: ${msg}`);
    } catch (err) {
      failed.push(err.message || String(err));
      console.log(`FAIL: ${err.message || String(err)}`);
    }
  }

  console.log("\\nSummary:");
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
})();
