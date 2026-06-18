import { DurableObject } from "cloudflare:workers";
import { ClientEventSchema, maskContact } from "../src/chat-core/protocol";
import type { Member, Message, ServerEvent } from "../src/chat-core/types";

/** Per-connection data that must survive WebSocket hibernation. */
interface Attachment {
  userId: string;
  name: string;
  /** Browser-install id (shared across tabs) — keys the persistent rate-limit window. */
  clientId: string;
  /** Timestamps of recent `send` events — sliding-window rate limit. */
  sends?: number[];
}

interface Row {
  seq: number;
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
  maskApplied: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const INITIAL_HISTORY_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

const rowToMessage = (r: Row): Message => ({
  id: r.id,
  senderId: r.senderId,
  senderName: r.senderName,
  text: r.text,
  ts: r.ts,
  maskApplied: r.maskApplied === 1,
  seq: Number(r.seq),
});

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
    const clientId = (url.searchParams.get("clientId") ?? crypto.randomUUID()).slice(0, 128);

    // Restore this client's rate-limit window (persisted on the previous close)
    // so dropping and reopening the socket can't reset the quota.
    const restored = (await this.ctx.storage.get<number[]>(`rl:${clientId}`)) ?? [];
    const sends = restored.filter((t) => t > Date.now() - RATE_LIMIT_WINDOW_MS);

    const { 0: client, 1: server } = new WebSocketPair();
    // acceptWebSocket (not server.accept()) is what enables hibernation.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, name, clientId, sends } satisfies Attachment);

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
        const id = crypto.randomUUID();
        this.ctx.storage.sql.exec(
          "INSERT INTO messages (id, senderId, senderName, text, ts, maskApplied) VALUES (?, ?, ?, ?, ?, ?)",
          id,
          att.userId,
          att.name,
          masked,
          now,
          maskApplied ? 1 : 0,
        );
        // SQLite rowid is a per-DO monotonic sequence — our total message order.
        const seq = Number(
          (this.ctx.storage.sql.exec("SELECT last_insert_rowid() AS s").one() as { s: number }).s,
        );
        // Keep history small on a public demo.
        this.ctx.storage.sql.exec(
          "DELETE FROM messages WHERE ts < ?",
          now - HISTORY_TTL_MS,
        );
        const message: Message = {
          id,
          senderId: att.userId,
          senderName: att.name,
          text: masked,
          ts: now,
          maskApplied,
          seq,
          // Echo the sender's clientMsgId so their optimistic bubble reconciles.
          clientMsgId: event.clientMsgId,
        };
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
      case "history_request": {
        const limit = Math.min(event.limit ?? INITIAL_HISTORY_LIMIT, MAX_PAGE_LIMIT);
        const { messages, hasMore } = this.olderMessages(event.beforeSeq, limit);
        this.sendTo(ws, { type: "history_page", messages, hasMore });
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att) {
      // Persist the rate-limit window so it survives socket close → reconnect.
      if (att.clientId && att.sends?.length) {
        const fresh = att.sends.filter((t) => t > Date.now() - RATE_LIMIT_WINDOW_MS);
        if (fresh.length) await this.ctx.storage.put(`rl:${att.clientId}`, fresh);
        else await this.ctx.storage.delete(`rl:${att.clientId}`);
      }
      // Clear any lingering typing indicator for the user whose socket just died.
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

  /** Most-recent page for the initial `hello`. */
  private recentMessages(): Message[] {
    // Filter at read time too — cleanup-on-insert misses rooms that go idle
    // long enough for messages to age past the TTL without a new send.
    const cutoff = Date.now() - HISTORY_TTL_MS;
    const rows = this.ctx.storage.sql
      .exec(
        "SELECT rowid AS seq, id, senderId, senderName, text, ts, maskApplied FROM messages WHERE ts >= ? ORDER BY rowid DESC LIMIT ?",
        cutoff,
        INITIAL_HISTORY_LIMIT,
      )
      .toArray() as unknown as Row[];
    return rows.map(rowToMessage).reverse();
  }

  /** An older page for infinite scroll, cursored by seq (rowid). */
  private olderMessages(
    beforeSeq: number | undefined,
    limit: number,
  ): { messages: Message[]; hasMore: boolean } {
    const cutoff = Date.now() - HISTORY_TTL_MS;
    const before = beforeSeq ?? Number.MAX_SAFE_INTEGER;
    const rows = this.ctx.storage.sql
      .exec(
        "SELECT rowid AS seq, id, senderId, senderName, text, ts, maskApplied FROM messages WHERE ts >= ? AND rowid < ? ORDER BY rowid DESC LIMIT ?",
        cutoff,
        before,
        limit + 1, // fetch one extra to know if more remain
      )
      .toArray() as unknown as Row[];
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map(rowToMessage).reverse();
    return { messages, hasMore };
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
