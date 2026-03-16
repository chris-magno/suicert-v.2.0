#!/usr/bin/env node
/**
 * SUICERT Webhook Test Script
 * 
 * Usage:
 *   node scripts/test-webhook.js
 *   node scripts/test-webhook.js --event leave
 *   node scripts/test-webhook.js --progress 75
 * 
 * Simulates Google Meet webhook payloads sent to /api/webhooks/meet
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const EVENT_ID = process.env.EVENT_ID || "evt_001";
const EMAIL = process.env.EMAIL || "demo@user.com";

const args = process.argv.slice(2);
const eventType = args.includes("--event") ? args[args.indexOf("--event") + 1] : "heartbeat";
const progress = args.includes("--progress") ? parseInt(args[args.indexOf("--progress") + 1]) : 50;

const PAYLOADS = {
  join: {
    eventId: EVENT_ID,
    meetingId: "abc-defg-hij",
    participantEmail: EMAIL,
    participantName: "Demo User",
    eventType: "join",
    timestamp: new Date().toISOString(),
  },
  heartbeat: {
    eventId: EVENT_ID,
    meetingId: "abc-defg-hij",
    participantEmail: EMAIL,
    participantName: "Demo User",
    eventType: "heartbeat",
    timestamp: new Date().toISOString(),
    totalSecondsInMeeting: Math.floor((progress / 100) * 90 * 60),
  },
  leave: {
    eventId: EVENT_ID,
    meetingId: "abc-defg-hij",
    participantEmail: EMAIL,
    participantName: "Demo User",
    eventType: "leave",
    timestamp: new Date().toISOString(),
    totalSecondsInMeeting: 5400, // 90 minutes
  },
  invalid: {
    eventId: "not-a-uuid",
    meetingId: "",
    participantEmail: "not-an-email",
    eventType: "unknown",
    timestamp: "not-a-date",
  },
};

async function sendWebhook(payload) {
  console.log(`\n📡 Sending ${payload.eventType || "invalid"} webhook to ${BASE_URL}/api/webhooks/meet`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(`${BASE_URL}/api/webhooks/meet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log(`\n✅ Response (${res.status}):`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("❌ Request failed:", err.message);
  }
}

async function runTests() {
  console.log("═══════════════════════════════════════");
  console.log("  SUICERT Webhook Test Runner");
  console.log("═══════════════════════════════════════");
  console.log(`Target: ${BASE_URL}`);
  console.log(`Event:  ${EVENT_ID}`);
  console.log(`User:   ${EMAIL}`);

  if (eventType === "all") {
    // Run full simulation: join → heartbeat → complete → leave
    await sendWebhook(PAYLOADS.join);
    await new Promise(r => setTimeout(r, 500));
    await sendWebhook({ ...PAYLOADS.heartbeat, totalSecondsInMeeting: 1800 }); // 30min
    await new Promise(r => setTimeout(r, 500));
    await sendWebhook({ ...PAYLOADS.heartbeat, totalSecondsInMeeting: 3600 }); // 60min
    await new Promise(r => setTimeout(r, 500));
    await sendWebhook({ ...PAYLOADS.heartbeat, totalSecondsInMeeting: 5400 }); // 90min - complete
    await new Promise(r => setTimeout(r, 500));
    await sendWebhook(PAYLOADS.leave);

    console.log("\n🧪 Testing invalid payload (should return 400):");
    await sendWebhook(PAYLOADS.invalid);
  } else {
    await sendWebhook(PAYLOADS[eventType] || PAYLOADS.heartbeat);
  }

  console.log("\n═══════════════════════════════════════");
  console.log("  Tests complete.");
  console.log("═══════════════════════════════════════\n");
}

runTests();
