import { NextResponse } from "next/server";
import { getPublicProfiles } from "@/lib/supabase";

export async function GET() {
  try {
    const profiles = await getPublicProfiles();
    return NextResponse.json(profiles);
  } catch {
    return NextResponse.json([]);
  }
}
