import { NextRequest, NextResponse } from "next/server";
import { getPublicProfileById } from "@/lib/supabase";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await getPublicProfileById(id);
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
}
