import { z } from "zod";

// Contact-masking policy: discourage off-platform deals by redacting phone
// numbers / emails from messages. Pure function → trivially unit-testable, and
// shared by the worker so the rule is enforced server-side.
const PATTERNS: readonly RegExp[] = [
  /01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}/g, // KR mobile
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // email
  /\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4}/g, // generic phone with separators
];

export function maskContact(
  text: string,
  extraPatterns: readonly RegExp[] = [],
): string {
  // Built-in patterns (phone/email) plus any domain-specific ones the caller
  // adds — e.g. academy names (artdata) or KakaoTalk handles (off-platform deals).
  return [...PATTERNS, ...extraPatterns].reduce((acc, re) => acc.replace(re, "[비공개]"), text);
}

// Runtime schema for events the client sends to the server. The worker calls
// `ClientEventSchema.safeParse(json)` so a malformed (or tampered) payload
// never reaches business logic — the TypeScript types alone are not a defence.
// ── Rich message payloads: media attachments + interactive cards ──
// These are the extension point that lets any service (appointments, trade
// status, safe-pay, AI bots…) ride on top of the chat without touching the core.
export const MediaSchema = z.object({
  url: z.url(),
  mime: z.string().max(100),
  name: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
});
export type Media = z.infer<typeof MediaSchema>;

export const CardActionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(40),
  style: z.enum(["primary", "default"]).optional(),
});
export const CardSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional(),
  actions: z.array(CardActionSchema).max(4).optional(),
  /** Arbitrary string metadata a service attaches (e.g. appointment time). */
  meta: z.record(z.string(), z.string()).optional(),
});
export type Card = z.infer<typeof CardSchema>;

export const ClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("send"),
    text: z.string().min(1).max(4000),
    /** Client-generated id so the optimistic bubble can be reconciled with the echo. */
    clientMsgId: z.string().min(1).max(64).optional(),
  }),
  z.object({ type: z.literal("typing"), isTyping: z.boolean() }),
  z.object({ type: z.literal("read"), messageId: z.string().min(1).max(128) }),
  z.object({
    type: z.literal("history_request"),
    beforeSeq: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  // Rich message: image/file/system/card (plain text stays on `send`).
  z.object({
    type: z.literal("compose"),
    kind: z.enum(["image", "file", "system", "card"]),
    text: z.string().max(2000).optional(),
    media: MediaSchema.optional(),
    card: CardSchema.optional(),
    clientMsgId: z.string().min(1).max(64).optional(),
  }),
  // Inline action: tapping a card button (e.g. accept an appointment).
  z.object({
    type: z.literal("action"),
    messageId: z.string().min(1).max(128),
    actionId: z.string().min(1).max(64),
  }),
]);

export type ClientEvent = z.infer<typeof ClientEventSchema>;

// ── Shared message/member models — single source of truth, imported by the
// worker too so client and server validate against the exact same schema. ──
export const MessageSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  text: z.string(),
  ts: z.number(),
  maskApplied: z.boolean().optional(),
  /** Server-assigned monotonic order (SQLite rowid). Absent on optimistic messages. */
  seq: z.number().optional(),
  /** Echoed back by the server to correlate with the sender's optimistic bubble. */
  clientMsgId: z.string().optional(),
  /** Client-local delivery state. Never set by the server. */
  status: z.enum(["sending", "sent", "failed"]).optional(),
  // Rich content — absent or "text" renders as a plain bubble.
  kind: z.enum(["text", "image", "file", "system", "card"]).optional(),
  media: MediaSchema.optional(),
  card: CardSchema.optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MemberSchema = z.object({ id: z.string(), name: z.string() });
export type Member = z.infer<typeof MemberSchema>;

// Runtime schema for events the server broadcasts to clients. The client runs
// `ServerEventSchema.safeParse` on every frame so a malformed (or tampered)
// payload never reaches the UI — the TypeScript types alone are not a defence.
export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    selfId: z.string(),
    selfName: z.string(),
    history: z.array(MessageSchema),
    members: z.array(MemberSchema),
  }),
  z.object({ type: z.literal("message"), message: MessageSchema }),
  z.object({
    type: z.literal("typing"),
    senderId: z.string(),
    senderName: z.string(),
    isTyping: z.boolean(),
  }),
  z.object({ type: z.literal("read"), messageId: z.string(), readerId: z.string() }),
  z.object({ type: z.literal("presence"), members: z.array(MemberSchema) }),
  z.object({
    type: z.literal("system"),
    severity: z.enum(["info", "warn"]),
    reason: z.string(),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal("history_page"),
    messages: z.array(MessageSchema),
    hasMore: z.boolean(),
  }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;
