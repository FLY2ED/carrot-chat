import { DurableObject } from "cloudflare:workers";
import { ClientEventSchema, maskContact } from "../src/chat-core/protocol";
import type { Member, Message, ServerEvent } from "../src/chat-core/types";

/** Per-connection data that must survive WebSocket hibernation. */
interface Attachment {
  userId: string;
  name: string;
  /** Timestamps of recent `send` events — sliding-window rate limit. */
  sends?: number[];
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * One ChatRoom Durable Object per room id. Holds the WebSocket connections and
 * the message history (in the DO's embedded SQLite). Uses the WebSocket
 * Hibernation API so idle rooms cost nothing while staying connected.
 */
export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (
        id         TEXT PRIMARY KEY,
        senderId   TEXT NOT NULL,
        senderName TEXT NOT NULL,
        text       TEXT NOT NULL,
        ts         INTEGER NOT NULL
      )`,
    );
    // Idempotent migration — add the column on existing rooms once.
    try {
      ctx.storage.sql.exec(
        "ALTER TABLE messages ADD COLUMN maskApplied INTEGER NOT NULL DEFAULT 0",
      );
    } catch {
      /* column already exists from a previous migration */
    }
    // Runtime answers "ping" with "pong" without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = (url.searchParams.get("user") ?? crypto.randomUUID()).slice(0, 64);
    const name = (url.searchParams.get("name") ?? "익명").slice(0, 32);

    const { 0: client, 1: server } = new WebSocketPair();
    // acceptWebSocket (not server.accept()) is what enables hibernation.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, name, sends: [] } satisfies Attachment);

    this.sendTo(server, {
      type: "hello",
      selfId: userId,
      selfName: name,
      history: this.recentMessages(),
      members: this.members(),
    });
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return; // ignore non-JSON frames (e.g. a stray "pong")
    }

    // Runtime validation — TypeScript types are not a defence against tampering.
    const parsed = ClientEventSchema.safeParse(payload);
    if (!parsed.success) {
      this.sendTo(ws, {
        type: "system",
        severity: "warn",
        reason: "validation_failed",
        detail: parsed.error.issues[0]?.message ?? "invalid payload",
      });
      return;
    }
    const event = parsed.data;

    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;

    switch (event.type) {
      case "send": {
        // Sliding-window rate limit per connection.
        const now = Date.now();
        const recent = (att.sends ?? []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
        if (recent.length >= RATE_LIMIT_MAX) {
          this.sendTo(ws, { type: "system", severity: "warn", reason: "rate_limited" });
          return;
        }
        recent.push(now);
        ws.serializeAttachment({ ...att, sends: recent } satisfies Attachment);

        // Policy control: strip phone/email/contact handles (off-platform deals).
        const original = event.text.trim().slice(0, 2000);
        if (!original) return;
        const masked = maskContact(original);
        const maskApplied = original !== masked;
        const message: Message = {
          id: crypto.randomUUID(),
          senderId: att.userId,
          senderName: att.name,
          text: masked,
          ts: now,
          maskApplied,
        };
        this.ctx.storage.sql.exec(
          "INSERT INTO messages (id, senderId, senderName, text, ts, maskApplied) VALUES (?, ?, ?, ?, ?, ?)",
          message.id,
          message.senderId,
          message.senderName,
          message.text,
          message.ts,
          maskApplied ? 1 : 0,
        );
        // Keep history small on a public demo.
        this.ctx.storage.sql.exec(
          "DELETE FROM messages WHERE ts < ?",
          now - HISTORY_TTL_MS,
        );
        this.broadcast({ type: "message", message });
        break;
      }
      case "typing": {
        this.broadcast(
          { type: "typing", senderId: att.userId, senderName: att.name, isTyping: event.isTyping },
          ws,
        );
        break;
      }
      case "read": {
        this.broadcast({ type: "read", messageId: event.messageId, readerId: att.userId }, ws);
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Clear any lingering typing indicator for the user whose socket just died.
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att) {
      this.broadcast({
        type: "typing",
        senderId: att.userId,
        senderName: att.name,
        isTyping: false,
      });
    }
    this.broadcastPresence();
  }

  async webSocketError(): Promise<void> {
    this.broadcastPresence();
  }

  private recentMessages(): Message[] {
    type Row = {
      id: string;
      senderId: string;
      senderName: string;
      text: string;
      ts: number;
      maskApplied: number;
    };
    // Filter at read time too — cleanup-on-insert misses rooms that go idle
    // long enough for messages to age past the TTL without a new send.
    const cutoff = Date.now() - HISTORY_TTL_MS;
    const rows = this.ctx.storage.sql
      .exec(
        "SELECT id, senderId, senderName, text, ts, maskApplied FROM messages WHERE ts >= ? ORDER BY ts DESC LIMIT 100",
        cutoff,
      )
      .toArray() as unknown as Row[];
    return rows
      .map((r) => ({
        id: r.id,
        senderId: r.senderId,
        senderName: r.senderName,
        text: r.text,
        ts: r.ts,
        maskApplied: r.maskApplied === 1,
      }))
      .reverse();
  }

  private members(): Member[] {
    const byId = new Map<string, Member>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att) byId.set(att.userId, { id: att.userId, name: att.name });
    }
    return [...byId.values()];
  }

  private sendTo(ws: WebSocket, event: ServerEvent): void {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      /* socket already gone */
    }
  }

  private broadcast(event: ServerEvent, except?: WebSocket): void {
    const data = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(data);
      } catch {
        /* socket already gone */
      }
    }
  }

  private broadcastPresence(): void {
    this.broadcast({ type: "presence", members: this.members() });
  }
}
