"use client";
import { useState, useEffect, useRef } from "react";
import { Award, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { ProgressBar, Button, Card, Badge } from "@/components/ui";
import { subscribeToProgress } from "@/lib/ably";
import type { CertEvent, Attendance } from "@/types";

interface Props {
  event: CertEvent;
  attendance: Attendance | null;
  onClaim?: (attendanceId: string) => void;
}

export default function AttendanceTracker({ event, attendance, onClaim }: Props) {
  const [progress, setProgress] = useState(attendance?.progressPercent ?? 0);
  const [minutes, setMinutes] = useState(attendance?.totalMinutes ?? 0);
  const [_status, setStatus] = useState(attendance?.status ?? "not_started");
  const [message, setMessage] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const inactive = !event.issuer?.subscriptionActive;

  useEffect(() => {
    // Simulate Ably connection delay
    const connectTimer = setTimeout(() => {
      setLiveConnected(true);
      if (!attendance?.id) return;
      unsubRef.current = subscribeToProgress(attendance.id, (update) => {
        setProgress(update.progressPercent);
        setMinutes(update.totalMinutes);
        setStatus(update.status);
        if (update.message) setMessage(update.message);
      });
    }, 800);

    return () => {
      clearTimeout(connectTimer);
      unsubRef.current?.();
    };
  }, [attendance?.id]);

  async function handleClaim() {
    setClaiming(true);
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceId: attendance?.id }),
      });
      if (res.ok) {
        setClaimed(true);
        if (attendance?.id) onClaim?.(attendance.id);
      }
    } finally {
      setClaiming(false);
    }
  }

  const done = progress >= 100;
  const requiredMins = event.requiredMinutes;

  return (
    <div className={inactive ? "subscription-inactive" : ""}>
      {inactive && (
        <div style={{
          background: "var(--bg-subtle)", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 16,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertCircle size={14} color="var(--text-muted)" />
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Issuer subscription inactive. Certificate issuance paused.</p>
        </div>
      )}

      <Card style={{ padding: "24px", overflow: "hidden", position: "relative" }}>
        {/* Live connection indicator */}
        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", alignItems: "center", gap: 5 }}>
          {liveConnected ? (
            <Badge variant="success" dot>Live tracking</Badge>
          ) : (
            <Badge variant="warning" dot>Connecting...</Badge>
          )}
        </div>

        {/* Title */}
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          Your Progress
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>
          Stay in the meeting to earn your certificate
        </p>

        {/* Progress bar */}
        <div style={{ marginBottom: 20 }}>
          <ProgressBar percent={progress} size="lg" inactive={inactive} />
        </div>

        {/* Stats row */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20,
        }}>
          {[
            { label: "Time in meeting", value: `${minutes}m`, icon: <Clock size={14} /> },
            { label: "Required", value: `${requiredMins}m`, icon: <Award size={14} /> },
            { label: "Remaining", value: done ? "Done! 🎉" : `${Math.max(0, requiredMins - minutes)}m`, icon: <CheckCircle2 size={14} /> },
          ].map((s) => (
            <div key={s.label} style={{
              background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)",
              padding: "12px", textAlign: "center",
            }}>
              <div style={{ color: "var(--text-muted)", display: "flex", justifyContent: "center", marginBottom: 4 }}>{s.icon}</div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>{s.value}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Milestones */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {[25, 50, 75, 100].map((milestone) => {
            const reached = progress >= milestone;
            return (
              <div key={milestone} style={{
                flex: 1, padding: "8px 4px", borderRadius: "var(--radius-sm)",
                background: reached ? "var(--mint-subtle)" : "var(--bg-subtle)",
                border: `1px solid ${reached ? "#a7f3d0" : "var(--border)"}`,
                textAlign: "center", transition: "all 0.3s ease",
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: reached ? "var(--mint)" : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {reached ? "✓" : ""} {milestone}%
                </p>
              </div>
            );
          })}
        </div>

        {/* Message */}
        {message && (
          <div style={{
            background: "var(--mint-subtle)", border: "1px solid #a7f3d0",
            borderRadius: "var(--radius-sm)", padding: "12px 14px",
            marginBottom: 16, fontSize: 13, color: "var(--mint)", fontWeight: 500,
            animation: "fadeUp 0.4s ease-out",
          }}>
            {message}
          </div>
        )}

        {/* Claim button */}
        {done && !claimed && (
          <Button
            variant="sui"
            size="lg"
            loading={claiming}
            icon={<Award size={16} />}
            onClick={handleClaim}
            style={{ width: "100%", justifyContent: "center", animation: "scaleIn 0.3s ease-out" }}
          >
            Claim Your Certificate
          </Button>
        )}

        {claimed && (
          <div style={{
            background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
            border: "1.5px solid #6ee7b7", borderRadius: "var(--radius)",
            padding: "16px", textAlign: "center",
            animation: "scaleIn 0.3s ease-out",
          }}>
            <CheckCircle2 size={24} color="var(--mint)" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--mint)" }}>
              Certificate Minted!
            </p>
            <p style={{ fontSize: 12, color: "var(--mint)", marginTop: 4 }}>
              Your Soulbound Token is being confirmed on Sui blockchain
            </p>
          </div>
        )}

        {!done && !claimed && (
          <div style={{
            background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)",
            padding: "12px 14px", textAlign: "center",
            fontSize: 13, color: "var(--text-muted)",
          }}>
            🔒 Certificate unlocks at 100% attendance
          </div>
        )}
      </Card>
    </div>
  );
}
