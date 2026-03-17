// lib/supabase/index.ts — Real Supabase client (lazy initialized)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CertEvent, Issuer, Certificate, Attendance, UserIdentity } from "@/types";

// Lazy clients — created only when first used (not at build time)
let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabaseAdmin;
}

function normalizeWalletAddress(walletAddress?: string): string | undefined {
  if (!walletAddress) return undefined;
  return walletAddress.trim().toLowerCase();
}

// ── User Identity (Google / zkLogin) ─────────────────────────────────────
export async function getUserIdentityByUserId(userId: string): Promise<UserIdentity | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_identities")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapUserIdentity(data) : null;
}

export async function upsertUserIdentity(identity: {
  userId: string;
  authProvider?: "google" | "zklogin";
  zkloginAddress?: string;
  walletBoundAddress?: string;
  lastWalletVerifiedAt?: string;
}): Promise<UserIdentity> {
  const payload = {
    user_id: identity.userId,
    auth_provider: identity.authProvider ?? "google",
    zklogin_address: normalizeWalletAddress(identity.zkloginAddress),
    wallet_bound_address: normalizeWalletAddress(identity.walletBoundAddress),
    last_wallet_verified_at: identity.lastWalletVerifiedAt,
  };

  const { data, error } = await getSupabaseAdmin()
    .from("user_identities")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapUserIdentity(data);
}

export async function bindWalletToUserIdentity(params: {
  userId: string;
  walletAddress: string;
  verifiedAt?: string;
}): Promise<UserIdentity> {
  const existing = await getUserIdentityByUserId(params.userId).catch(() => null);

  return upsertUserIdentity({
    userId: params.userId,
    authProvider: existing?.authProvider ?? "google",
    zkloginAddress: existing?.zkloginAddress,
    walletBoundAddress: params.walletAddress,
    lastWalletVerifiedAt: params.verifiedAt ?? new Date().toISOString(),
  });
}

export async function isWalletBoundToUser(userId: string, walletAddress: string): Promise<boolean> {
  const identity = await getUserIdentityByUserId(userId);
  const incoming = normalizeWalletAddress(walletAddress);
  const bound = normalizeWalletAddress(identity?.walletBoundAddress);

  if (!incoming || !bound) return false;
  return incoming === bound;
}

export async function createAuthAuditLog(input: {
  userId?: string;
  authProvider?: string;
  walletAddress?: string;
  event: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from("auth_audit_logs").insert({
    user_id: input.userId,
    auth_provider: input.authProvider,
    wallet_address: normalizeWalletAddress(input.walletAddress),
    event: input.event,
    details: input.details ?? {},
  });

  if (error) throw new Error(error.message);
}

// ── Events ────────────────────────────────────────────────────────────────
export async function getEvents(filters?: { status?: string; issuerId?: string; category?: string }): Promise<CertEvent[]> {
  const sb = getSupabase();
  let q = sb.from("events").select("*, issuer:issuers(*)").order("created_at", { ascending: false });
  if (filters?.status)   q = q.eq("status",    filters.status);
  if (filters?.issuerId) q = q.eq("issuer_id", filters.issuerId);
  if (filters?.category) q = q.eq("category",  filters.category);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEvent);
}

export async function getEvent(id: string): Promise<CertEvent | null> {
  const { data } = await getSupabase().from("events").select("*, issuer:issuers(*)").eq("id", id).single();
  return data ? mapEvent(data) : null;
}

export async function createEvent(evt: Omit<CertEvent,"id"|"createdAt"|"attendeeCount"|"mintedCount">): Promise<CertEvent> {
  const { data, error } = await getSupabaseAdmin().from("events").insert({
    issuer_id: evt.issuerId, title: evt.title, description: evt.description,
    category: evt.category, cover_image: evt.coverImage, meet_link: evt.meetLink,
    start_time: evt.startTime, end_time: evt.endTime,
    required_minutes: evt.requiredMinutes, status: "draft", tags: evt.tags,
  }).select("*, issuer:issuers(*)").single();
  if (error) throw new Error(error.message);
  return mapEvent(data);
}

export async function updateEventStatus(id: string, status: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("events").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Issuers ───────────────────────────────────────────────────────────────
export async function getIssuers(status?: string): Promise<Issuer[]> {
  let q = getSupabaseAdmin().from("issuers").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapIssuer);
}

export async function getIssuer(id: string): Promise<Issuer | null> {
  const { data } = await getSupabaseAdmin().from("issuers").select("*").eq("id", id).single();
  return data ? mapIssuer(data) : null;
}

export async function getIssuerByWallet(walletAddress: string): Promise<Issuer | null> {
  const normalized = normalizeWalletAddress(walletAddress);
  if (!normalized) return null;

  // Support both legacy/new schema naming to prevent duplicate wallet applications.
  const { data, error } = await getSupabaseAdmin()
    .from("issuers")
    .select("*")
    .or(`wallet_address.eq.${normalized},sui_wallet_address.eq.${normalized}`)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapIssuer(data) : null;
}

export async function getIssuerByEmail(email: string): Promise<Issuer | null> {
  const { data } = await getSupabaseAdmin().from("issuers").select("*").eq("email", email).single();
  return data ? mapIssuer(data) : null;
}

export async function createIssuer(issuer: {
  walletAddress?: string; email: string; name: string; organization: string;
  website?: string; description: string; aiScore: number; aiSummary: string; status: string;
}): Promise<Issuer> {
  const walletAddress = normalizeWalletAddress(issuer.walletAddress);

  const baseInsert = {
    email: issuer.email,
    name: issuer.name,
    organization: issuer.organization,
    website: issuer.website,
    description: issuer.description,
    ai_score: issuer.aiScore,
    ai_summary: issuer.aiSummary,
    status: issuer.status,
    subscription_active: false,
  };

  // Prefer wallet_address, then fallback to sui_wallet_address for older schemas.
  const firstTry = await getSupabaseAdmin()
    .from("issuers")
    .insert({ ...baseInsert, wallet_address: walletAddress })
    .select("*")
    .single();

  if (!firstTry.error) return mapIssuer(firstTry.data);

  const firstMessage = firstTry.error.message.toLowerCase();
  if (!firstMessage.includes("wallet_address") || !firstMessage.includes("column")) {
    throw new Error(firstTry.error.message);
  }

  const secondTry = await getSupabaseAdmin()
    .from("issuers")
    .insert({ ...baseInsert, sui_wallet_address: walletAddress })
    .select("*")
    .single();

  if (secondTry.error) throw new Error(secondTry.error.message);
  return mapIssuer(secondTry.data);
}

export async function updateIssuerStatus(
  id: string,
  status: string,
  extra?: { issuerCapId?: string; registrationTxDigest?: string; registrationExplorerUrl?: string; onchainRegisteredAt?: string }
): Promise<void> {
  const basePayload: Record<string, unknown> = {
    status,
    verified_at: status === "approved" ? new Date().toISOString() : undefined,
  };

  const payloadWithOnChainFields: Record<string, unknown> = {
    ...basePayload,
    issuer_cap_id: extra?.issuerCapId,
    registration_tx_digest: extra?.registrationTxDigest,
    registration_explorer_url: extra?.registrationExplorerUrl,
    onchain_registered_at: extra?.onchainRegisteredAt,
  };

  const first = await getSupabaseAdmin().from("issuers").update(payloadWithOnChainFields).eq("id", id);
  if (!first.error) return;

  // Backward compatibility for databases that do not yet include on-chain metadata columns.
  if (!first.error.message.toLowerCase().includes("column")) {
    throw new Error(first.error.message);
  }

  const fallback = await getSupabaseAdmin().from("issuers").update(basePayload).eq("id", id);
  if (fallback.error) throw new Error(fallback.error.message);
}

export async function updateIssuerSubscription(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabaseAdmin().from("issuers").update({ subscription_active: active }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Attendance ────────────────────────────────────────────────────────────
export async function getAttendance(id: string): Promise<Attendance | null> {
  const { data } = await getSupabase().from("attendance").select("*").eq("id", id).single();
  return data ? mapAttendance(data) : null;
}

export async function getAttendanceByUserAndEvent(userEmail: string, eventId: string): Promise<Attendance | null> {
  const { data } = await getSupabase().from("attendance").select("*")
    .eq("user_email", userEmail).eq("event_id", eventId).single();
  return data ? mapAttendance(data) : null;
}

export async function createAttendance(att: { eventId: string; userEmail: string; userName: string; userId?: string }): Promise<Attendance> {
  const channel = `attendance:att_${Date.now()}`;
  const { data, error } = await getSupabaseAdmin().from("attendance").insert({
    event_id: att.eventId, user_email: att.userEmail, user_name: att.userName,
    user_id: att.userId, total_minutes: 0, progress_percent: 0,
    status: "not_started", ably_channel: channel,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return mapAttendance(data);
}

export async function updateAttendanceProgress(id: string, progressPercent: number, totalMinutes: number, extra?: { joinTime?: string; leaveTime?: string }): Promise<void> {
  const { error } = await getSupabaseAdmin().from("attendance").update({
    progress_percent: progressPercent, total_minutes: totalMinutes,
    status: progressPercent >= 100 ? "completed" : "in_progress",
    join_time: extra?.joinTime, leave_time: extra?.leaveTime,
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Certificates ──────────────────────────────────────────────────────────
export async function getCertificate(id: string): Promise<Certificate | null> {
  const { data } = await getSupabase().from("certificates").select("*").eq("id", id).single();
  return data ? mapCertificate(data) : null;
}

export async function getCertificateByObjectId(objectId: string): Promise<Certificate | null> {
  const { data } = await getSupabase().from("certificates").select("*").eq("sui_object_id", objectId).single();
  return data ? mapCertificate(data) : null;
}

export async function getCertificatesByEmail(email: string): Promise<Certificate[]> {
  const { data } = await getSupabase().from("certificates").select("*")
    .eq("recipient_email", email).order("issued_at", { ascending: false });
  return (data ?? []).map(mapCertificate);
}

export async function createCertificate(cert: {
  attendanceId?: string; eventId: string; recipientName: string;
  recipientEmail: string; issuerName: string; eventTitle: string;
  suiObjectId?: string; ipfsHash?: string; metadataUri?: string;
  aiSummary?: string; walletAddress?: string;
}): Promise<Certificate> {
  const { data, error } = await getSupabaseAdmin().from("certificates").insert({
    attendance_id: cert.attendanceId, event_id: cert.eventId,
    recipient_name: cert.recipientName, recipient_email: cert.recipientEmail,
    issuer_name: cert.issuerName, event_title: cert.eventTitle,
    sui_object_id: cert.suiObjectId, ipfs_hash: cert.ipfsHash,
    metadata_uri: cert.metadataUri, ai_summary: cert.aiSummary,
    wallet_address: cert.walletAddress, verified: !!cert.suiObjectId,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return mapCertificate(data);
}

export async function getAdminStats() {
  const [issuersRes, eventsRes, certsRes] = await Promise.all([
    getSupabase().from("issuers").select("id, status"),
    getSupabase().from("events").select("id, status"),
    getSupabase().from("certificates").select("id").gte("issued_at", new Date().toISOString().split("T")[0]),
  ]);
  const issuers = issuersRes.data ?? [];
  const events  = eventsRes.data  ?? [];
  return {
    totalIssuers: issuers.length,
    pendingIssuers: issuers.filter((i) => i.status === "pending" || i.status === "pending_onchain").length,
    totalEvents: events.length,
    totalCertificates: 0,
    mintedToday: certsRes.data?.length ?? 0,
    activeNow: events.filter((e) => e.status === "live").length,
  };
}

// ── Mappers ───────────────────────────────────────────────────────────────
function mapEvent(d: Record<string,unknown>): CertEvent {
  return {
    id: d.id as string, issuerId: d.issuer_id as string,
    issuer: d.issuer ? mapIssuer(d.issuer as Record<string,unknown>) : undefined,
    title: d.title as string, description: (d.description as string) ?? "",
    category: d.category as string, coverImage: d.cover_image as string|undefined,
    meetLink: d.meet_link as string, startTime: d.start_time as string,
    endTime: d.end_time as string, requiredMinutes: d.required_minutes as number,
    status: d.status as CertEvent["status"],
    attendeeCount: (d.attendee_count as number) ?? 0,
    mintedCount: (d.minted_count as number) ?? 0,
    createdAt: d.created_at as string, metadataUri: d.metadata_uri as string|undefined,
    tags: (d.tags as string[]) ?? [],
  };
}

function mapIssuer(d: Record<string,unknown>): Issuer {
  return {
    id: d.id as string, userId: (d.user_id as string) ?? "",
    name: d.name as string, organization: d.organization as string,
    email: d.email as string, website: d.website as string|undefined,
    description: d.description as string, status: d.status as Issuer["status"],
    aiScore: d.ai_score as number|undefined, aiSummary: d.ai_summary as string|undefined,
    verifiedAt: d.verified_at as string|undefined, createdAt: d.created_at as string,
    issuerCapId: (d.issuer_cap_id as string | undefined),
    registrationTxDigest: (d.registration_tx_digest as string | undefined),
    registrationExplorerUrl: (d.registration_explorer_url as string | undefined),
    onchainRegisteredAt: (d.onchain_registered_at as string | undefined),
    subscriptionActive: (d.subscription_active as boolean) ?? false,
    suiWalletAddress: ((d.wallet_address ?? d.sui_wallet_address) as string|undefined),
  };
}

function mapAttendance(d: Record<string,unknown>): Attendance {
  return {
    id: d.id as string, eventId: d.event_id as string,
    userId: (d.user_id as string) ?? "",
    userEmail: d.user_email as string, userName: d.user_name as string,
    joinTime: d.join_time as string|undefined, leaveTime: d.leave_time as string|undefined,
    totalMinutes: (d.total_minutes as number) ?? 0,
    progressPercent: (d.progress_percent as number) ?? 0,
    status: d.status as Attendance["status"],
    certificateId: d.certificate_id as string|undefined,
    ablyChannel: d.ably_channel as string,
  };
}

function mapCertificate(d: Record<string,unknown>): Certificate {
  return {
    id: d.id as string, attendanceId: (d.attendance_id as string) ?? "",
    eventId: d.event_id as string, userId: (d.user_id as string) ?? "",
    recipientName: d.recipient_name as string, recipientEmail: d.recipient_email as string,
    issuerName: d.issuer_name as string, eventTitle: d.event_title as string,
    issuedAt: d.issued_at as string, suiObjectId: d.sui_object_id as string|undefined,
    ipfsHash: d.ipfs_hash as string|undefined, metadataUri: d.metadata_uri as string|undefined,
    aiSummary: d.ai_summary as string|undefined, qrCode: d.qr_code as string|undefined,
    verified: (d.verified as boolean) ?? false,
  };
}

function mapUserIdentity(d: Record<string, unknown>): UserIdentity {
  return {
    userId: d.user_id as string,
    authProvider: ((d.auth_provider as "google" | "zklogin" | undefined) ?? "google"),
    zkloginAddress: (d.zklogin_address as string | undefined),
    walletBoundAddress: (d.wallet_bound_address as string | undefined),
    lastWalletVerifiedAt: (d.last_wallet_verified_at as string | undefined),
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string,
  };
}
