import { DurableObject } from "cloudflare:workers";
import { ClientEventSchema, maskContact } from "../src/chat-core";
import type { Member, Message, ServerEvent } from "../src/chat-core";

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

interface Stats {
  messageCount: number;
  maskedCount: number;
  rateLimitedCount: number;
  reconnectCount: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const INITIAL_HISTORY_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const STAT_COLUMNS = ["messageCount", "maskedCount", "rateLimitedCount", "reconnectCount"] as const;
type StatColumn = (typeof STAT_COLUMNS)[number];

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
 *
 * Operational counters are reported to the AdminHub DO fire-and-forget so the
 * admin console never sits on the chat send path.
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
    try {
      ctx.storage.sql.exec(
        "ALTER TABLE messages ADD COLUMN maskApplied INTEGER NOT NULL DEFAULT 0",
      );
    } catch {
      /* column already exists from a previous migration */
    }
    // Operational counters (survive hibernation; read by the admin console).
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS room_stats (
        id               INTEGER PRIMARY KEY,
        messageCount     INTEGER NOT NULL DEFAULT 0,
        maskedCount      INTEGER NOT NULL DEFAULT 0,
        rateLimitedCount INTEGER NOT NULL DEFAULT 0,
        reconnectCount   INTEGER NOT NULL DEFAULT 0
      )`,
    );
    ctx.storage.sql.exec("INSERT OR IGNORE INTO room_stats (id) VALUES (1)");
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

    // Remember our room id (ChatRoom can't see the name it was addressed by).
    const roomId = url.pathname.match(/\/api\/room\/([^/]+)\/ws/)?.[1] ?? "unknown";
    await this.ctx.storage.put("roomId", roomId);

    // Restore this client's rate-limit window (persisted on the previous close)
    // so dropping and reopening the socket can't reset the quota.
    const restored = (await this.ctx.storage.get<number[]>(`rl:${clientId}`)) ?? [];
    const sends = restored.filter((t) => t > Date.now() - RATE_LIMIT_WINDOW_MS);

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, name, clientId, sends } satisfies Attachment);

    this.bump("reconnectCount");
    this.sendTo(server, {
      type: "hello",
      selfId: userId,
      selfName: name,
      history: this.recentMessages(),
      members: this.members(),
    });
    this.broadcastPresence();
    void this.reportToHub(true);

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
        const now = Date.now();
        const recent = (att.sends ?? []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
        if (recent.length >= RATE_LIMIT_MAX) {
          this.bump("rateLimitedCount");
          this.sendTo(ws, { type: "system", severity: "warn", reason: "rate_limited" });
          void this.reportToHub(true);
          return;
        }
        recent.push(now);
        ws.serializeAttachment({ ...att, sends: recent } satisfies Attachment);

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
        const seq = Number(
          (this.ctx.storage.sql.exec("SELECT last_insert_rowid() AS s").one() as { s: number }).s,
        );
        this.ctx.storage.sql.exec(
          "DELETE FROM messages WHERE ts < ?",
          now - HISTORY_TTL_MS,
        );
        this.bump("messageCount");
        if (maskApplied) this.bump("maskedCount");
        // Structured log — counts/flags only, never message text (no PII).
        console.log(JSON.stringify({ evt: "send", masked: maskApplied, seq }));
        const message: Message = {
          id,
          senderId: att.userId,
          senderName: att.name,
          text: masked,
          ts: now,
          maskApplied,
          seq,
          clientMsgId: event.clientMsgId,
        };
        this.broadcast({ type: "message", message });
        void this.reportToHub(true);
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
      if (att.clientId && att.sends?.length) {
        const fresh = att.sends.filter((t) => t > Date.now() - RATE_LIMIT_WINDOW_MS);
        if (fresh.length) await this.ctx.storage.put(`rl:${att.clientId}`, fresh);
        else await this.ctx.storage.delete(`rl:${att.clientId}`);
      }
      this.broadcast({
        type: "typing",
        senderId: att.userId,
        senderName: att.name,
        isTyping: false,
      });
    }
    this.broadcastPresence();
    // A room with no live sockets left is no longer "active".
    void this.reportToHub(this.members().length > 0);
  }

  async webSocketError(): Promise<void> {
    this.broadcastPresence();
  }

  /** Read-only RPC for the admin console — wraps the private history query. */
  async adminRecentMessages(): Promise<Message[]> {
    return this.recentMessages();
  }

  private bump(col: StatColumn): void {
    // `col` is constrained to a known column union — safe to interpolate.
    this.ctx.storage.sql.exec(`UPDATE room_stats SET ${col} = ${col} + 1 WHERE id = 1`);
  }

  private readStats(): Stats {
    return this.ctx.storage.sql
      .exec(
        "SELECT messageCount, maskedCount, rateLimitedCount, reconnectCount FROM room_stats WHERE id = 1",
      )
      .one() as unknown as Stats;
  }

  /** Fire-and-forget report to the global admin aggregator. Never throws upward. */
  private async reportToHub(active: boolean): Promise<void> {
    try {
      const roomId = (await this.ctx.storage.get<string>("roomId")) ?? "unknown";
      await this.env.ADMIN_HUB.getByName("global").reportSnapshot(roomId, active, {
        members: this.members().length,
        ...this.readStats(),
      });
    } catch {
      /* admin visibility is best-effort — chat must not depend on it */
    }
  }

  private recentMessages(): Message[] {
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
        limit + 1,
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
