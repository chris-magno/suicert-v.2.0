import Link from "next/link";
import { Shield, CheckCircle2, XCircle, ExternalLink, ArrowLeft, Clock, User, Award } from "lucide-react";
import { verifySoulboundToken } from "@/lib/sui";
import { getCertificateByObjectId } from "@/lib/supabase";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ objectId: string }> }) {
  const { objectId } = await params;

  let cert = null;
  try {
    cert = await getCertificateByObjectId(objectId);
  } catch {
    cert = null;
  }

  let onChainResult = null;
  try {
    onChainResult = await verifySoulboundToken(cert?.suiObjectId ?? objectId);
  } catch {
    onChainResult = null;
  }

  const isValid = !!(cert?.verified && onChainResult?.exists);
  const network = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet";

  return (
    <div style={{
      minHeight: "100vh",
      background: isValid
        ? "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f0f9ff 100%)"
        : "linear-gradient(135deg, #fff1f2 0%, #fef2f2 100%)",
    }}>
      {/* Top bar */}
      <div style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid var(--border)", padding: "0 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, #4DA2FF, #97EFE9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Shield size={14} color="white" strokeWidth={2.5} />
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16 }}>
              SUI<span style={{ color: "var(--accent)" }}>CERT</span>
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>· Verification Portal</span>
          </div>
          <Link href="/" style={{ fontSize: 12, color: "var(--text-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            <ArrowLeft size={12} /> Back to SUICERT
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
        {/* Status hero */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%", margin: "0 auto 20px",
            background: isValid ? "var(--mint-subtle)" : "var(--coral-subtle)",
            border: `3px solid ${isValid ? "#6ee7b7" : "#fca5a5"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isValid ? "0 0 0 8px rgba(16,185,129,0.1)" : "0 0 0 8px rgba(239,68,68,0.1)",
          }}>
            {isValid ? <CheckCircle2 size={36} color="var(--mint)" /> : <XCircle size={36} color="var(--coral)" />}
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8, color: isValid ? "var(--mint)" : "var(--coral)" }}>
            {isValid ? "Certificate Verified ✓" : "Certificate Not Found"}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, maxWidth: 400, margin: "0 auto" }}>
            {isValid
              ? "This certificate is authentic and permanently recorded on the Sui blockchain."
              : "We couldn't find a valid certificate with this ID. It may be invalid or revoked."}
          </p>
        </div>

        {cert && isValid ? (
          <>
            <Card style={{ overflow: "hidden", marginBottom: 20, borderColor: "#a7f3d0", borderWidth: 2 }}>
              <div style={{ height: 4, background: "linear-gradient(90deg, #4DA2FF, #97EFE9, #10b981)" }} />
              <div style={{ padding: "28px 32px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                  <div>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 4 }}>SUICERT · Soulbound Token</p>
                    <Badge variant="success" dot>Verified on Sui Blockchain</Badge>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>ISSUED</p>
                    <p style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                      {new Date(cert.issuedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>

                <div style={{ textAlign: "center", padding: "24px 32px", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", margin: "0 -32px" }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>This certifies that</p>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 6 }}>{cert.recipientName}</h2>
                  <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>has successfully completed</p>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--accent-dark)", marginTop: 8 }}>{cert.eventTitle}</p>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                    Issued by <strong style={{ color: "var(--text-primary)" }}>{cert.issuerName}</strong>
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
                  {[
                    { icon: <Award size={13} />, label: "Sui Object ID", value: `${cert.suiObjectId?.slice(0, 16)}...` },
                    { icon: <Shield size={13} />, label: "Token Type", value: "Soulbound (non-transferable)" },
                    { icon: <User size={13} />, label: "Recipient", value: cert.recipientEmail },
                    { icon: <Clock size={13} />, label: "Block Time", value: new Date(cert.issuedAt).toLocaleTimeString() },
                  ].map((item) => (
                    <div key={item.label} style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                        {item.icon} {item.label}
                      </div>
                      <p style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-all" }}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {cert.aiSummary && (
                  <div style={{ marginTop: 20, background: "var(--accent-subtle)", border: "1px solid #bae6fd", borderRadius: "var(--radius-sm)", padding: "14px 16px" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-dark)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                      🤖 AI Attendance Summary
                    </p>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{cert.aiSummary}</p>
                  </div>
                )}
              </div>
            </Card>

            {cert.suiObjectId && (
              <a
                href={`https://suiscan.xyz/${network}/object/${cert.suiObjectId}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: "linear-gradient(135deg, #4DA2FF, #097EED)",
                  color: "white", padding: "13px", borderRadius: "var(--radius)",
                  textDecoration: "none", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, marginBottom: 12,
                }}
              >
                <ExternalLink size={15} /> View on Sui Explorer
              </a>
            )}
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
              Verification ID: <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{objectId}</code>
            </p>
          </>
        ) : (
          <Card style={{ padding: "40px", textAlign: "center" }}>
            <XCircle size={32} color="var(--border-strong)" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
              No certificate found for this ID
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
              Object ID: <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-subtle)", padding: "2px 6px", borderRadius: 4 }}>{objectId}</code>
            </p>
            <Link href="/dashboard" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>
              ← Browse certified events
            </Link>
          </Card>
        )}

        <div style={{ marginTop: 32, textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
            SUICERT certificates are Soulbound Tokens (SBTs) on the Sui blockchain.<br />
            They cannot be transferred, copied, or forged. Verified data is permanent.
          </p>
        </div>
      </div>
    </div>
  );
}
