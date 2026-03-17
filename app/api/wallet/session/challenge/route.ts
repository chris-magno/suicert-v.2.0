import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createWalletChallenge } from "@/lib/wallet/challenge-store";
import { consumeRateLimit, getClientIdentifier } from "@/lib/security/rate-limit";
import { normalizeSuiAddress } from "@/lib/wallet/address";

const ChallengeRequestSchema = z.object({
  address: z.string().transform((value, ctx) => {
    const normalized = normalizeSuiAddress(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "address must be a valid Sui address" });
      return z.NEVER;
    }
    return normalized;
  }),
});

function authDebug(event: string, meta: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[wallet-auth]", event, meta);
  }
}

function fail(
  error: string,
  code: string,
  status: number,
  headers?: Record<string, string>
) {
  return NextResponse.json({ error, code }, { status, headers });
}

export async function POST(req: NextRequest) {
  try {
    const client = getClientIdentifier(req);
    const rawLimit = consumeRateLimit({
      key: `wallet:challenge:raw:${client}`,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rawLimit.allowed) {
      authDebug("challenge_rate_limited_raw", { client });
      return fail("Too many challenge requests. Please retry shortly.", "CHALLENGE_RATE_LIMIT_RAW", 429, {
        "Retry-After": String(rawLimit.retryAfterSeconds),
        "X-RateLimit-Remaining": String(rawLimit.remaining),
      });
    }

    const body = await req.json();
    const parsed = ChallengeRequestSchema.safeParse(body);
    if (!parsed.success) {
      authDebug("challenge_validation_failed", { details: parsed.error.flatten() });
      return NextResponse.json({ error: "Validation failed", code: "CHALLENGE_VALIDATION_FAILED", details: parsed.error.flatten() }, { status: 400 });
    }

    const address = parsed.data.address;
    const scopedLimit = consumeRateLimit({
      key: `wallet:challenge:${client}:${address}`,
      limit: 20,
      windowMs: 60_000,
    });
    if (!scopedLimit.allowed) {
      authDebug("challenge_rate_limited_scoped", { client, address });
      return fail("Too many challenge requests for this wallet. Please retry shortly.", "CHALLENGE_RATE_LIMIT_SCOPED", 429, {
        "Retry-After": String(scopedLimit.retryAfterSeconds),
        "X-RateLimit-Remaining": String(scopedLimit.remaining),
      });
    }

    const challenge = createWalletChallenge(address);
    return NextResponse.json({ success: true, ...challenge });
  } catch {
    authDebug("challenge_invalid_body");
    return fail("Invalid body", "CHALLENGE_INVALID_BODY", 400);
  }
}
