// app/api/health/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    version: process.env.npm_package_version ?? "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    services: {
      supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      ably: !!process.env.ABLY_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      sui: !!process.env.SUI_PACKAGE_ID,
      pinata: !!process.env.PINATA_API_KEY,
    },
  });
}
