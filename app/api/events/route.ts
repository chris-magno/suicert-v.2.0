// app/api/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { CreateEventSchema } from "@/lib/validators";
import { getEvents, createEvent, updateEventStatus } from "@/lib/supabase";
import { requireSuiCertWriteGates } from "@/lib/auth/gates";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const events = await getEvents({
      status:   searchParams.get("status")   ?? undefined,
      issuerId: searchParams.get("issuerId") ?? undefined,
      category: searchParams.get("category") ?? undefined,
    });
    return NextResponse.json(events);
  } catch { return NextResponse.json([]); }
}

export async function POST(req: NextRequest) {
  try {
    const gates = await requireSuiCertWriteGates(req, { requireFreshSignature: true });
    if (!gates.ok) return gates.response;

    const body   = await req.json();
    const result = CreateEventSchema.safeParse(body);
    if (!result.success) return NextResponse.json({ error: "Validation failed", details: result.error.flatten() }, { status: 400 });
    const event = await createEvent({ ...result.data, issuerId: body.issuerId, status: "draft" as const });
    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/events]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const gates = await requireSuiCertWriteGates(req, { requireFreshSignature: true });
    if (!gates.ok) return gates.response;

    const { id, status } = await req.json();
    await updateEventStatus(id, status);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/events]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
