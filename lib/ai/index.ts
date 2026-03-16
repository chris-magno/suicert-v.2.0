// lib/ai/index.ts
// AI service — issuer verification + attendance summaries
// Set ANTHROPIC_API_KEY in .env.local to use real Claude Opus

export interface IssuerVerificationResult {
  score: number;
  recommendation: "approve" | "review" | "reject";
  summary: string;
  flags: string[];
  processingTime: number;
  provider: "mock" | "anthropic";
  scoreBreakdown?: Record<string, number>;
}

export interface AttendanceSummaryResult {
  summary: string;
  highlights: string[];
  engagementScore: number;
}

// ── Production (uncomment when ANTHROPIC_API_KEY is set) ─────────────────────
// import Anthropic from "@anthropic-ai/sdk";
//
// const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
//
// export async function verifyIssuer(issuerData: {
//   name: string; organization: string; email: string; website?: string; description: string;
// }): Promise<IssuerVerificationResult> {
//   const start = Date.now();
//   const response = await anthropic.messages.create({
//     model: "claude-opus-4-5",
//     max_tokens: 1024,
//     system: `You are a trust verification specialist for SUICERT, a blockchain certification platform.
// Analyze the provided organization details and return ONLY valid JSON with this exact shape:
// { "score": <0-100>, "recommendation": <"approve"|"review"|"reject">, "summary": "<2-3 sentences>", "flags": ["<flag1>", ...] }
// Score guide: 80+ approve, 55-79 review, <55 reject.
// Trust signals: organizational email domain, website presence, description quality, professional language.
// Red flags: personal email (gmail/yahoo), vague description, suspicious patterns.`,
//     messages: [{ role: "user", content: JSON.stringify(issuerData) }],
//   });
//   const text = response.content[0].type === "text" ? response.content[0].text : "{}";
//   const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
//   return { ...parsed, processingTime: Date.now() - start };
// }
//
// export async function generateAttendanceSummary(data: {
//   attendeeName: string; eventTitle: string; totalMinutes: number;
//   requiredMinutes: number; joinTime: string; leaveTime: string;
// }): Promise<AttendanceSummaryResult> {
//   const response = await anthropic.messages.create({
//     model: "claude-opus-4-5",
//     max_tokens: 512,
//     system: "Generate a professional attendance certificate summary. Return ONLY JSON: { \"summary\": \"<2-3 sentences>\", \"highlights\": [\"<str>\", ...], \"engagementScore\": <0-100> }",
//     messages: [{ role: "user", content: JSON.stringify(data) }],
//   });
//   const text = response.content[0].type === "text" ? response.content[0].text : "{}";
//   return JSON.parse(text.replace(/```json|```/g, "").trim());
// }

// ── Mock Implementation ───────────────────────────────────────────────────────

export async function verifyIssuer(issuerData: {
  name: string;
  organization: string;
  email: string;
  website?: string;
  description: string;
}): Promise<IssuerVerificationResult> {
  const start = Date.now();
  await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));

  let score = 50;
  const scoreBreakdown: Record<string, number> = { base: 50 };
  const flags: string[] = [];

  if (issuerData.website) {
    score += 15;
    scoreBreakdown.website = 15;
  } else {
    flags.push("No website provided");
    scoreBreakdown.website = 0;
  }

  const personalDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"];
  const emailDomain = issuerData.email.split("@")[1] ?? "";
  if (personalDomains.includes(emailDomain)) {
    score -= 10;
    flags.push("Personal email domain detected");
    scoreBreakdown.emailDomain = -10;
  } else {
    score += 10;
    scoreBreakdown.emailDomain = 10;
  }

  if (issuerData.description.length > 200) {
    score += 10;
    scoreBreakdown.descriptionQuality = 10;
  } else {
    scoreBreakdown.descriptionQuality = 0;
  }
  if (issuerData.organization.length > 10) {
    score += 10;
    scoreBreakdown.organizationDetail = 10;
  } else {
    scoreBreakdown.organizationDetail = 0;
  }
  score = Math.min(100, Math.max(0, score));

  const recommendation: "approve" | "review" | "reject" =
    score >= 80 ? "approve" : score >= 55 ? "review" : "reject";

  const summaries = {
    approve: `${issuerData.organization} demonstrates strong institutional credibility with consistent digital presence and professional communication. Domain verification passed. Recommend immediate approval.`,
    review: `${issuerData.organization} shows moderate trust signals. Professional email domain is adequate but limited verifiable online history warrants manual review before approval.`,
    reject: `${issuerData.organization} exhibits multiple low-trust indicators. Recommend rejection until additional verification documents are submitted.`,
  };

  return {
    score,
    recommendation,
    summary: summaries[recommendation],
    flags,
    processingTime: Date.now() - start,
    provider: "mock",
    scoreBreakdown,
  };
}

export async function generateAttendanceSummary(data: {
  attendeeName: string;
  eventTitle: string;
  totalMinutes: number;
  requiredMinutes: number;
  joinTime: string;
  leaveTime: string;
}): Promise<AttendanceSummaryResult> {
  await new Promise((r) => setTimeout(r, 1200));
  const rate = (data.totalMinutes / data.requiredMinutes) * 100;
  const engagementScore = Math.min(100, Math.floor(rate * 0.9 + Math.random() * 10));
  return {
    summary: `${data.attendeeName} participated in "${data.eventTitle}" for ${data.totalMinutes} minutes, ${rate >= 100 ? "meeting and exceeding" : "meeting"} the ${data.requiredMinutes}-minute attendance requirement. Attendance was continuous with no significant drop-off detected. This certificate verifies genuine presence throughout the certified event.`,
    highlights: [
      `Joined at ${new Date(data.joinTime).toLocaleTimeString()}`,
      `Total verified time: ${data.totalMinutes} minutes`,
      `Completion rate: ${Math.min(100, Math.round(rate))}%`,
      engagementScore > 85 ? "Consistent session engagement detected" : "Adequate attendance verified",
    ],
    engagementScore,
  };
}
