import Navbar from "@/components/layout/Navbar";
import EventCard from "@/components/events/EventCard";
import { Badge } from "@/components/ui";
import { getEvents } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let events: import("@/types").CertEvent[] = [];
  try { events = await getEvents(); } catch { events = []; }

  const liveEvents     = events.filter((e) => e.status === "live");
  const upcomingEvents = events.filter((e) => e.status === "draft");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 6 }}>
            Certified Events
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
            Attend events and earn Soulbound Token certificates on the Sui blockchain.
          </p>
        </div>

        {liveEvents.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>Live Now</h2>
              <Badge variant="danger" dot>{liveEvents.length} active</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
              {liveEvents.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
          </div>
        )}

        {upcomingEvents.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800 }}>Upcoming</h2>
              <Badge variant="default">{upcomingEvents.length} scheduled</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 20 }}>
              {upcomingEvents.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
          </div>
        )}

        {events.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 24px", color: "var(--text-muted)" }}>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, marginBottom: 8 }}>No events yet</p>
            <p style={{ fontSize: 14 }}>Events created by verified issuers will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
