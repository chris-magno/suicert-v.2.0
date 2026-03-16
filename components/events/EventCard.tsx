"use client";
import Link from "next/link";
import { Calendar, Clock, Users, Award, ExternalLink } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { CertEvent } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  blockchain: "sui",
  finance: "warning",
  tech: "info",
  education: "success",
  business: "default",
  healthcare: "success",
  other: "default",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function EventCard({ event }: { event: CertEvent }) {
  const isLive = event.status === "live";
  const isEnded = event.status === "ended";
  const inactive = !event.issuer?.subscriptionActive;

  return (
    <Card hover style={{ overflow: "hidden", position: "relative" }}>
      {/* Live indicator strip */}
      {isLive && (
        <div style={{
          height: 3,
          background: "linear-gradient(90deg, var(--coral), #ff6b6b, var(--gold))",
          animation: "shimmer 2s infinite linear",
          backgroundSize: "400px 100%",
        }} />
      )}

      <div style={{ padding: "20px 22px" }} className={inactive ? "subscription-inactive" : ""}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge variant={CATEGORY_COLORS[event.category] as "sui" | "warning" | "info" | "success" | "default"}>{event.category}</Badge>
            {isLive && (
              <Badge variant="danger" dot>Live now</Badge>
            )}
            {isEnded && <Badge variant="default">Ended</Badge>}
            {event.status === "draft" && <Badge variant="warning">Draft</Badge>}
          </div>
          {inactive && (
            <Badge variant="default">Inactive</Badge>
          )}
        </div>

        {/* Title */}
        <h3 style={{
          fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700,
          marginBottom: 8, lineHeight: 1.3, color: "var(--text-primary)",
        }}>{event.title}</h3>

        {/* Description */}
        <p style={{
          fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5,
          marginBottom: 16, display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{event.description}</p>

        {/* Issuer */}
        {event.issuer && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "linear-gradient(135deg, var(--sui-blue), var(--sui-teal))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "white",
            }}>
              {event.issuer.name.charAt(0)}
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{event.issuer.name}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{event.issuer.organization}</p>
            </div>
            {event.issuer.status === "approved" && (
              <div style={{ marginLeft: "auto" }}>
                <Badge variant="success">✓ Verified</Badge>
              </div>
            )}
          </div>
        )}

        {/* Meta row */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16,
          fontSize: 12, color: "var(--text-muted)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Calendar size={11} /> {formatDate(event.startTime)}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} /> {formatTime(event.startTime)}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} /> {event.requiredMinutes}min required
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Users size={11} /> {event.attendeeCount.toLocaleString()} attendees
          </span>
        </div>

        {/* Tags */}
        {event.tags.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
            {event.tags.map((tag) => (
              <span key={tag} style={{
                fontSize: 11, color: "var(--text-muted)", background: "var(--bg-subtle)",
                padding: "2px 8px", borderRadius: 99, fontFamily: "var(--font-mono)",
              }}>#{tag}</span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 14, borderTop: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: 12 }}>
            <Award size={12} />
            <span>{event.mintedCount} minted</span>
          </div>
          <Link href={`/events/${event.id}`} style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 13, fontWeight: 600, color: "var(--accent)",
            textDecoration: "none", fontFamily: "var(--font-display)",
          }}>
            {isLive ? "Join & Track" : "View Details"}
            <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    </Card>
  );
}
