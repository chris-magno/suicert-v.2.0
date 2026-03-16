// lib/pinata/index.ts
// Pinata IPFS uploads for certificate metadata
// In production: uses PINATA_API_KEY and PINATA_SECRET_API_KEY

export interface CertMetadata {
  name: string;
  description: string;
  image?: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  external_url?: string;
  // W3C Verifiable Credential fields
  "@context": string[];
  type: string[];
  credentialSubject: {
    id: string;
    name: string;
    email: string;
    achievement: string;
    issuer: string;
    issuedOn: string;
    attendanceMinutes: number;
  };
}

/**
 * Mock: Pin certificate metadata to IPFS via Pinata
 * In production:
 *   const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
 *     method: "POST",
 *     headers: {
 *       "Content-Type": "application/json",
 *       pinata_api_key: process.env.PINATA_API_KEY!,
 *       pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY!,
 *     },
 *     body: JSON.stringify({ pinataContent: metadata, pinataMetadata: { name: `suicert_${certId}` } }),
 *   });
 *   const data = await res.json();
 *   return `ipfs://${data.IpfsHash}`;
 */
export async function pinCertMetadata(
  certId: string,
  _metadata: CertMetadata
): Promise<string> {
  await new Promise((r) => setTimeout(r, 600));
  const mockHash = `Qm${Array.from({ length: 44 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join("")}`;
  console.log(`[PINATA MOCK] Pinned cert ${certId} → ipfs://${mockHash}`);
  return `ipfs://${mockHash}`;
}

/**
 * Build W3C-compatible metadata for a SUICERT certificate
 */
export function buildCertMetadata(params: {
  certId: string;
  recipientName: string;
  recipientEmail: string;
  recipientAddress: string;
  eventTitle: string;
  issuerName: string;
  issuedAt: string;
  attendanceMinutes: number;
  aiSummary?: string;
}): CertMetadata {
  return {
    name: `SUICERT: ${params.eventTitle}`,
    description: params.aiSummary ?? `Certificate of attendance for "${params.eventTitle}" issued by ${params.issuerName}.`,
    attributes: [
      { trait_type: "Issuer", value: params.issuerName },
      { trait_type: "Event", value: params.eventTitle },
      { trait_type: "Recipient", value: params.recipientName },
      { trait_type: "Issued Date", value: new Date(params.issuedAt).toISOString().split("T")[0] },
      { trait_type: "Attendance (minutes)", value: params.attendanceMinutes },
      { trait_type: "Token Type", value: "Soulbound" },
      { trait_type: "Blockchain", value: "Sui Mainnet" },
      { trait_type: "Standard", value: "W3C Verifiable Credential" },
    ],
    external_url: `https://suicert.app/verify/${params.certId}`,
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://schema.org",
    ],
    type: ["VerifiableCredential", "CertificateOfAttendance"],
    credentialSubject: {
      id: `did:sui:${params.recipientAddress}`,
      name: params.recipientName,
      email: params.recipientEmail,
      achievement: params.eventTitle,
      issuer: params.issuerName,
      issuedOn: params.issuedAt,
      attendanceMinutes: params.attendanceMinutes,
    },
  };
}
