import { z } from "zod";

// Contact-masking policy: discourage off-platform deals by redacting phone
// numbers / emails from messages. Pure function → trivially unit-testable, and
// shared by the worker so the rule is enforced server-side.
const PATTERNS: readonly RegExp[] = [
  /01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4}/g, // KR mobile
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // email
  /\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4}/g, // generic phone with separators
];

export function maskContact(text: string): string {
  return PATTERNS.reduce((acc, re) => acc.replace(re, "[비공개]"), text);
}

// Runtime schema for events the client sends to the server. The worker calls
// `ClientEventSchema.safeParse(json)` so a malformed (or tampered) payload
// never reaches business logic — the TypeScript types alone are not a defence.
export const ClientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("send"), text: z.string().min(1).max(4000) }),
  z.object({ type: z.literal("typing"), isTyping: z.boolean() }),
  z.object({ type: z.literal("read"), messageId: z.string().min(1).max(128) }),
]);

export type ClientEvent = z.infer<typeof ClientEventSchema>;
