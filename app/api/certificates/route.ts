// app/api/certificates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { mintSoulboundToken } from "@/lib/sui";
import { generateAttendanceSummary } from "@/lib/ai";
import { getAttendance, getEvent, createCertificate, getCertificate, getCertificatesByEmail } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { attendanceId, walletAddress } = await req.json();
    const attendance = await getAttendance(attendanceId);
    if (!attendance) return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });
    if (attendance.progressPercent < 100) return NextResponse.json({ error: "Attendance requirement not met", progressPercent: attendance.progressPercent }, { status: 400 });
    const event = await getEvent(attendance.eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    if (!event.issuer?.subscriptionActive) return NextResponse.json({ error: "Issuer subscription inactive" }, { status: 403 });

    const aiResult = await generateAttendanceSummary({
      attendeeName: attendance.userName, eventTitle: event.title,
      totalMinutes: attendance.totalMinutes, requiredMinutes: event.requiredMinutes,
      joinTime: attendance.joinTime ?? new Date().toISOString(),
      leaveTime: attendance.leaveTime ?? new Date().toISOString(),
    });

    const recipientAddress = walletAddress ?? `0x${"0".repeat(64)}`;
    const mintResult = await mintSoulboundToken({
      recipientAddress, metadataUri: event.metadataUri ?? "", eventId: event.id,
      recipientName: attendance.userName, issuerName: event.issuer?.name ?? "Unknown",
    });

    const cert = await createCertificate({
      attendanceId, eventId: event.id,
      recipientName: attendance.userName, recipientEmail: attendance.userEmail,
      issuerName: event.issuer?.name ?? "Unknown", eventTitle: event.title,
      suiObjectId: mintResult.objectId, aiSummary: aiResult.summary, walletAddress,
    });

    return NextResponse.json({ success: true, certificate: cert, mintResult });
  } catch (error) {
    console.error("[POST /api/certificates]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id    = searchParams.get("id");
    const email = searchParams.get("email");
    if (id)    return NextResponse.json(await getCertificate(id));
    if (email) return NextResponse.json(await getCertificatesByEmail(email));
    return NextResponse.json([]);
  } catch { return NextResponse.json([]); }
}
