// lib/validators/index.ts
import { z } from "zod";

export const WebhookSchema = z.object({
  eventId: z.string().uuid("Invalid event ID"),
  meetingId: z.string().min(1, "Meeting ID required"),
  participantEmail: z.string().email("Invalid participant email"),
  participantName: z.string().min(1, "Participant name required"),
  eventType: z.enum(["join", "heartbeat", "leave"]),
  timestamp: z.string().datetime("Invalid timestamp"),
  totalSecondsInMeeting: z.number().optional(),
});

export const CreateEventSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(100),
  description: z.string().min(20, "Description must be at least 20 characters").max(2000),
  category: z.enum(["blockchain", "tech", "business", "education", "healthcare", "finance", "other"]),
  meetLink: z.string().url("Must be a valid URL").includes("meet.google.com", { message: "Must be a Google Meet link" }),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  requiredMinutes: z.number().min(5).max(480),
  tags: z.array(z.string()).max(5),
  coverImage: z.string().url().optional(),
});

export const IssuerApplicationSchema = z.object({
  name: z.string().min(2).max(100),
  organization: z.string().min(2).max(200),
  email: z.string().email(),
  website: z.string().url().optional().or(z.literal("")),
  description: z.string().min(50, "Please provide at least 50 characters describing your organization").max(1000),
  suiWalletAddress: z.string().startsWith("0x", "Must be a valid Sui address").min(66).max(66).optional().or(z.literal("")),
});

export const ClaimCertSchema = z.object({
  attendanceId: z.string().uuid(),
  suiWalletAddress: z.string().startsWith("0x").optional(),
});

export type WebhookInput = z.infer<typeof WebhookSchema>;
export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type IssuerApplicationInput = z.infer<typeof IssuerApplicationSchema>;
