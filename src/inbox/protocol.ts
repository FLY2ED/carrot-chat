import { z } from "zod";

// ── Multi-room inbox protocol ──
// App-level feature (not part of the @naldadev/chat core): a per-user Durable
// Object aggregates the rooms a user belongs to, with unread counts + previews.
// Shared by the UserInbox worker and the inbox page so both validate one schema.

export interface InboxRoom {
  roomId: string;
  lastText: string;
  lastTs: number;
  unread: number;
  favorite: boolean;
}

// Server → client: the full inbox snapshot (simpler than deltas for this scale).
export interface InboxServerEvent {
  type: "inbox";
  rooms: InboxRoom[];
}

// Client → server: mark a room read, or toggle its favorite flag. Validated
// server-side so a tampered frame never reaches the SQLite mutation.
export const InboxClientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("read"), roomId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("favorite"), roomId: z.string().min(1).max(64) }),
]);
export type InboxClientEvent = z.infer<typeof InboxClientEventSchema>;
