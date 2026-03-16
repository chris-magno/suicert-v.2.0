// lib/mock-data.ts
// All mock data removed — real data comes from Supabase
// File kept to avoid breaking any lingering imports during migration

export const MOCK_ISSUERS:      never[] = [];
export const MOCK_EVENTS:       never[] = [];
export const MOCK_CERTIFICATES: never[] = [];
export const MOCK_ATTENDANCE:   never[] = [];
export const MOCK_ADMIN_STATS = {
  totalIssuers: 0, pendingIssuers: 0, totalEvents: 0,
  totalCertificates: 0, mintedToday: 0, activeNow: 0,
};
