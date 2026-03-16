import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import CertificateDisplay from "@/components/certificates/CertificateDisplay";
import { getCertificate } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let cert = null;
  try {
    cert = await getCertificate(id);
  } catch {
    cert = null;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
        <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 32, fontWeight: 500 }}>
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>

        {cert ? (
          <div style={{ animation: "fadeUp 0.5s ease-out" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>
                Your Certificate
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
                This credential is permanently stored on the Sui blockchain as a Soulbound Token.
              </p>
            </div>
            <CertificateDisplay certificate={cert} />
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "80px 24px" }}>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Certificate not found</p>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
              This certificate ID is invalid or has not been minted yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
