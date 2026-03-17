// types/index.ts

export type IssuerStatus = "pending" | "pending_onchain" | "approved" | "rejected" | "suspended";
export type CertStatus = "draft" | "live" | "ended" | "cancelled";
export type AttendanceStatus = "not_started" | "in_progress" | "completed" | "failed";

export interface Issuer {
  id: string;
  userId: string;
  name: string;
  organization: string;
  email: string;
  website?: string;
  description: string;
  status: IssuerStatus;
  aiScore?: number;
  aiSummary?: string;
  verifiedAt?: string;
  issuerCapId?: string;
  registrationTxDigest?: string;
  registrationExplorerUrl?: string;
  onchainRegisteredAt?: string;
  createdAt: string;
  subscriptionActive: boolean;
  suiWalletAddress?: string;
}

export interface CertEvent {
  id: string;
  issuerId: string;
  issuer?: Issuer;
  title: string;
  description: string;
  category: string;
  coverImage?: string;
  meetLink: string;
  startTime: string;
  endTime: string;
  requiredMinutes: number;
  status: CertStatus;
  attendeeCount: number;
  mintedCount: number;
  createdAt: string;
  metadataUri?: string;
  tags: string[];
}

export interface Attendance {
  id: string;
  eventId: string;
  userId: string;
  userEmail: string;
  userName: string;
  joinTime?: string;
  leaveTime?: string;
  totalMinutes: number;
  progressPercent: number;
  status: AttendanceStatus;
  certificateId?: string;
  ablyChannel: string;
}

export interface Certificate {
  id: string;
  attendanceId: string;
  eventId: string;
  userId: string;
  recipientName: string;
  recipientEmail: string;
  issuerName: string;
  eventTitle: string;
  issuedAt: string;
  suiObjectId?: string;
  ipfsHash?: string;
  metadataUri?: string;
  aiSummary?: string;
  qrCode?: string;
  verified: boolean;
}

export interface WebhookPayload {
  eventId: string;
  meetingId: string;
  participantEmail: string;
  participantName: string;
  eventType: "join" | "heartbeat" | "leave";
  timestamp: string;
  totalSecondsInMeeting?: number;
}

export interface AdminStats {
  totalIssuers: number;
  pendingIssuers: number;
  totalEvents: number;
  totalCertificates: number;
  mintedToday: number;
  activeNow: number;
}

export interface UserIdentity {
  userId: string;
  authProvider: "google" | "zklogin";
  zkloginAddress?: string;
  walletBoundAddress?: string;
  lastWalletVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfile {
  id: string;
  name: string;
  organization: string;
  website?: string;
  description: string;
  aiScore?: number;
  verifiedAt?: string;
  createdAt: string;
}

// ── Sui Blockchain Types ──────────────────────────────────────────────────────

export interface SuiMintResult {
  objectId: string;
  digest: string;
  explorerUrl: string;
}

export interface SuiVerifyResult {
  exists: boolean;
  objectId: string;
  owner: string;
  metadata: Record<string, string>;
}
