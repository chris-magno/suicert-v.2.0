// app/api/ably/route.ts
// Issues Ably auth tokens for client-side real-time subscriptions.
// In production: use Ably's token request API with ABLY_API_KEY

import { NextRequest, NextResponse } from "next/server";
import { getAblyToken } from "@/lib/ably";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") ?? `anon_${Date.now()}`;

  // In production:
  // const ably = new Ably.Rest(process.env.ABLY_API_KEY!);
  // const tokenRequest = await ably.auth.createTokenRequest({ clientId });
  // return NextResponse.json(tokenRequest);

  const token = await getAblyToken(clientId);
  return NextResponse.json({ token, clientId });
}
