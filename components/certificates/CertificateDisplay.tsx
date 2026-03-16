"use client";
import { Shield, Award, ExternalLink, Download, Share2, CheckCircle2 } from "lucide-react";
import { Button, Badge, Card } from "@/components/ui";
import type { Certificate } from "@/types";

interface Props { certificate: Certificate; compact?: boolean; }

export default function CertificateDisplay({ certificate, compact = false }: Props) {
  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: certificate.eventTitle, text: `I earned a SUICERT certificate for "${certificate.eventTitle}"`, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }

  if (compact) {
    return (
      <Card hover style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "var(--radius-sm)", flexShrink: 0,
          background: "linear-gradient(135deg, #4DA2FF, #97EFE9)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Award size={20} color="white" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, lineHeight: 1.3, marginBottom: 2 }}>{certificate.eventTitle}</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{certificate.issuerName} · {new Date(certificate.issuedAt).toLocaleDateString()}</p>
        </div>
        <Badge variant={certificate.verified ? "success" : "warning"}>
          {certificate.verified ? "✓ Verified" : "Pending"}
        </Badge>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Certificate Card */}
      <div style={{
        background: "linear-gradient(145deg, #f9f8f6 0%, #ffffff 50%, #f0f9ff 100%)",
        border: "2px solid var(--border)", borderRadius: "var(--radius-xl)",
        padding: "48px 48px 40px", position: "relative", overflow: "hidden",
        boxShadow: "var(--shadow-xl)",
        animation: "scaleIn 0.4s ease-out",
      }}>
        {/* Background decoration */}
        <div style={{
          position: "absolute", top: -60, right: -60, width: 200, height: 200,
          borderRadius: "50%", background: "radial-gradient(circle, rgba(77,162,255,0.08), transparent)",
        }} />
        <div style={{
          position: "absolute", bottom: -40, left: -40, width: 160, height: 160,
          borderRadius: "50%", background: "radial-gradient(circle, rgba(151,239,233,0.1), transparent)",
        }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "linear-gradient(135deg, #4DA2FF, #97EFE9)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Shield size={18} color="white" strokeWidth={2.5} />
            </div>
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>
                SUI<span style={{ color: "var(--accent)" }}>CERT</span>
              </p>
              <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>ON-CHAIN CREDENTIAL</p>
            </div>
          </div>
          <Badge variant="success" dot>Verified on Sui</Badge>
        </div>

        {/* Certificate body */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600, marginBottom: 12 }}>
            This certifies that
          </p>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 800,
            letterSpacing: "-0.03em", marginBottom: 12, color: "var(--text-primary)",
          }}>{certificate.recipientName}</h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
            has successfully completed
          </p>
          <div style={{
            background: "var(--accent-subtle)", border: "1.5px solid #bae6fd",
            borderRadius: "var(--radius)", padding: "16px 24px", marginBottom: 16,
            display: "inline-block",
          }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--accent-dark)" }}>
              {certificate.eventTitle}
            </h2>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Issued by <strong>{certificate.issuerName}</strong>
          </p>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border)", margin: "0 -8px 28px" }} />

        {/* AI Summary */}
        {certificate.aiSummary && (
          <div style={{
            background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)",
            padding: "16px", marginBottom: 24,
            borderLeft: "3px solid var(--accent)",
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-dark)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>AI Attendance Summary</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{certificate.aiSummary}</p>
          </div>
        )}

        {/* Meta */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
          {[
            { label: "Issued", value: new Date(certificate.issuedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
            { label: "Sui Object ID", value: certificate.suiObjectId ? `${certificate.suiObjectId.slice(0, 8)}...` : "Pending" },
            { label: "Status", value: certificate.verified ? "✓ Verified" : "Pending" },
          ].map((m) => (
            <div key={m.label} style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 3 }}>{m.label}</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{m.value}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          {certificate.suiObjectId && (
            <Button
              variant="sui"
              size="md"
              icon={<ExternalLink size={14} />}
              onClick={() => window.open(`https://suiexplorer.com/object/${certificate.suiObjectId}`, "_blank")}
              style={{ flex: 1, justifyContent: "center" }}
            >
              View on Explorer
            </Button>
          )}
          <Button variant="secondary" size="md" icon={<Share2 size={14} />} onClick={handleShare}>Share</Button>
          <Button variant="secondary" size="md" icon={<Download size={14} />}>Download</Button>
        </div>
      </div>

      {/* Verification note */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginTop: 16, color: "var(--text-muted)", fontSize: 12 }}>
        <CheckCircle2 size={13} color="var(--mint)" />
        <span>This certificate is a Soulbound Token (SBT) — it cannot be transferred or forged.</span>
      </div>
    </div>
  );
}
