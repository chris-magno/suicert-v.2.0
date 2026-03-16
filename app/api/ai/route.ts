// app/api/ai/verify-issuer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyIssuer } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.organization || !body.email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await verifyIssuer(body);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "AI verification failed" }, { status: 500 });
  }
}
