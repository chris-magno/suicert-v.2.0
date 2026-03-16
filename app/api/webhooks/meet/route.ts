// app/api/webhooks/meet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { WebhookSchema } from "@/lib/validators";
import { publishProgressUpdate } from "@/lib/ably";
import { updateAttendanceProgress, getEvent, getAttendanceByUserAndEvent } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const result = WebhookSchema.safeParse(body);
    if (!result.success) return NextResponse.json({ error: "Invalid webhook payload", details: result.error.flatten() }, { status: 400 });

    const payload    = result.data;
    const attendance = await getAttendanceByUserAndEvent(payload.participantEmail, payload.eventId);
    if (!attendance) return NextResponse.json({ error: "Attendance record not found" }, { status: 404 });

    const event = await getEvent(payload.eventId);
    if (!event)  return NextResponse.json({ error: "Event not found" }, { status: 404 });

    let totalMinutes    = attendance.totalMinutes;
    let progressPercent = attendance.progressPercent;
    const extra: { joinTime?: string; leaveTime?: string } = {};

    if (payload.eventType === "join") {
      extra.joinTime = payload.timestamp;
    } else if (payload.eventType === "heartbeat" && payload.totalSecondsInMeeting) {
      totalMinutes    = Math.floor(payload.totalSecondsInMeeting / 60);
      progressPercent = Math.min(100, Math.round((totalMinutes / event.requiredMinutes) * 100));
    } else if (payload.eventType === "leave") {
      extra.leaveTime = payload.timestamp;
      if (payload.totalSecondsInMeeting) {
        totalMinutes    = Math.floor(payload.totalSecondsInMeeting / 60);
        progressPercent = Math.min(100, Math.round((totalMinutes / event.requiredMinutes) * 100));
      }
    }

    await updateAttendanceProgress(attendance.id, progressPercent, totalMinutes, extra);
    await publishProgressUpdate(attendance.id, {
      attendanceId: attendance.id, progressPercent, totalMinutes,
      status: progressPercent >= 100 ? "completed" : "in_progress",
      message: progressPercent >= 100 ? "🎉 Attendance requirement met! Your certificate is ready." : undefined,
    });

    return NextResponse.json({ success: true, progressPercent, totalMinutes });
  } catch (error) {
    console.error("[WEBHOOK ERROR]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
