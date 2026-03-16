// lib/ably/index.ts
// Real-time attendance progress via Ably
// Set ABLY_API_KEY in .env.local for production

export interface ProgressUpdate {
  attendanceId: string;
  progressPercent: number;
  totalMinutes: number;
  status: "in_progress" | "completed" | "failed";
  message?: string;
}

// ── Production (uncomment when ABLY_API_KEY is set) ───────────────────────────
// import Ably from "ably";
//
// export async function publishProgressUpdate(
//   attendanceId: string,
//   update: ProgressUpdate
// ): Promise<void> {
//   const client = new Ably.Rest(process.env.ABLY_API_KEY!);
//   const channel = client.channels.get(`attendance:${attendanceId}`);
//   await channel.publish("progress", update);
// }
//
// export async function getAblyToken(clientId: string): Promise<object> {
//   const client = new Ably.Rest(process.env.ABLY_API_KEY!);
//   return client.auth.createTokenRequest({ clientId });
// }

// ── Mock Implementation ───────────────────────────────────────────────────────

export async function publishProgressUpdate(
  attendanceId: string,
  update: ProgressUpdate
): Promise<void> {
  console.log(`[ABLY] attendance:${attendanceId}`, update);
  await new Promise((r) => setTimeout(r, 50));
}

export function subscribeToProgress(
  attendanceId: string,
  onUpdate: (update: ProgressUpdate) => void
): () => void {
  // In production: replace with Ably.Realtime client subscription
  // const client = new Ably.Realtime({ authUrl: "/api/ably" });
  // const channel = client.channels.get(`attendance:${attendanceId}`);
  // channel.subscribe("progress", (msg) => onUpdate(msg.data));
  // return () => channel.unsubscribe();

  let progress = 30;
  const interval = setInterval(() => {
    progress = Math.min(100, progress + Math.floor(Math.random() * 8 + 2));
    onUpdate({
      attendanceId,
      progressPercent: progress,
      totalMinutes: Math.floor((progress / 100) * 90),
      status: progress >= 100 ? "completed" : "in_progress",
      message: progress >= 100 ? "🎉 Attendance requirement met! Your certificate is ready." : undefined,
    });
    if (progress >= 100) clearInterval(interval);
  }, 3000);
  return () => clearInterval(interval);
}

export async function getAblyToken(clientId: string): Promise<string> {
  return `mock_token_${clientId}_${Date.now()}`;
}
