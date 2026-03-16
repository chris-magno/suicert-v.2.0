import { notFound } from "next/navigation";
import { Calendar, Clock, Users, ExternalLink, Award, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import AttendanceTracker from "@/components/attendance/AttendanceTracker";
import { Badge, Card } from "@/components/ui";
import { getEvent } from "@/lib/supabase";


export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  // Attendance is loaded client-side by AttendanceTracker via wallet session
  const attendance = null;

  const isLive = event.status === "live";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />

      {isLive && (
        <div style={{
          height: 3,
          background: "linear-gradient(90deg, #f43f5e, #ff6b6b, #f59e0b, #10b981, #0ea5e9, #4DA2FF)",
          backgroundSize: "400% 100%",
          animation: "shimmer 3s infinite linear",
        }} />
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 24, fontWeight: 500 }}>
          <ArrowLeft size={14} /> Back to Events
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 32, alignItems: "start" }}>
          {/* Left */}
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              <Badge variant="sui">{event.category}</Badge>
              {isLive && <Badge variant="danger" dot>Live now</Badge>}
              {event.issuer?.status === "approved" && <Badge variant="success">✓ Verified Issuer</Badge>}
            </div>

            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 16 }}>
              {event.title}
            </h1>

            {event.issuer && (
              <Card style={{ padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, var(--sui-blue), var(--sui-teal))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "white",
                }}>
                  {event.issuer.name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, fontFamily: "var(--font-display)" }}>{event.issuer.name}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{event.issuer.organization}</p>
                </div>
                {event.issuer.aiScore && (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: event.issuer.aiScore >= 80 ? "var(--mint)" : "var(--gold)" }}>
                      {event.issuer.aiScore}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>AI TRUST SCORE</p>
                  </div>
                )}
              </Card>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                { icon: <Calendar size={14} />, label: "Date", value: new Date(event.startTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) },
                { icon: <Clock size={14} />, label: "Time", value: `${new Date(event.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} – ${new Date(event.endTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` },
                { icon: <Clock size={14} />, label: "Required attendance", value: `${event.requiredMinutes} minutes minimum` },
                { icon: <Users size={14} />, label: "Attendees", value: `${event.attendeeCount.toLocaleString()} registered` },
              ].map((item) => (
                <div key={item.label} style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                    {item.icon}{item.label}
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{item.value}</p>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, marginBottom: 12 }}>About this seminar</h2>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>{event.description}</p>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
              {event.tags.map((tag) => (
                <span key={tag} style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--bg-subtle)", border: "1px solid var(--border)", padding: "4px 10px", borderRadius: 99, fontFamily: "var(--font-mono)" }}>
                  #{tag}
                </span>
              ))}
            </div>

            {isLive && (
              <a href={event.meetLink} target="_blank" rel="noopener noreferrer" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "linear-gradient(135deg, #1a73e8, #34a853)",
                color: "white", padding: "12px 20px", borderRadius: "var(--radius)",
                textDecoration: "none", fontWeight: 700, fontSize: 14, fontFamily: "var(--font-display)",
              }}>
                <ExternalLink size={15} /> Join Google Meet
              </a>
            )}
          </div>

          {/* Right: tracker */}
          <div style={{ position: "sticky", top: 80 }}>
            <AttendanceTracker event={event} attendance={attendance} />

            <Card style={{ padding: "20px", marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: "var(--radius-sm)", background: "linear-gradient(135deg, #4DA2FF, #97EFE9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Award size={18} color="white" />
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>Certificate Preview</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Soulbound Token on Sui</p>
                </div>
              </div>
              <div style={{ background: "linear-gradient(135deg, #f0f9ff, #ecfdf5)", border: "1.5px dashed #bae6fd", borderRadius: "var(--radius-sm)", padding: "20px", textAlign: "center" }}>
                <Award size={32} style={{ margin: "0 auto 8px", color: "var(--accent)" }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Complete {event.requiredMinutes}min attendance</p>
                <p style={{ fontSize: 11, marginTop: 4, color: "var(--text-muted)" }}>to unlock this certificate</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
