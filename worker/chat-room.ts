import { DurableObject } from "cloudflare:workers";
import { ClientEventSchema, maskContact } from "@naldadev/chat";
import type { Card, Media, Member, Message, ServerEvent } from "@naldadev/chat";
import {
  ASSISTANT_ID,
  ASSISTANT_NAME,
  parseAssistantTrigger,
  runAssistant,
} from "./assistant";

/** Per-connection data that must survive WebSocket hibernation. */
interface Attachment {
  userId: string;
  name: string;
  clientId: string;
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
  kind: string | null;
  payload: string | null;
  clientMsgId: string | null;
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
const HISTORY_COLS =
  "rowid AS seq, id, senderId, senderName, text, ts, maskApplied, kind, payload, clientMsgId";

const rowToMessage = (r: Row): Message => {
  let media: Media | undefined;
  let card: Card | undefined;
  if (r.payload) {
    try {
      const p = JSON.parse(r.payload) as { media?: Media; card?: Card };
      media = p.media;
      card = p.card;
    } catch {
      /* corrupt payload — render as plain */
    }
  }
  return {
    id: r.id,
    senderId: r.senderId,
    senderName: r.senderName,
    text: r.text,
    ts: r.ts,
    maskApplied: r.maskApplied === 1,
    seq: Number(r.seq),
    kind: (r.kind ?? "text") as Message["kind"],
    media,
    card,
    clientMsgId: r.clientMsgId ?? undefined,
  };
};

/** Short preview text for a message in the multi-room inbox list. */
const inboxPreview = (m: Message): string => {
  switch (m.kind) {
    case "system":
      return m.text;
    case "card":
      return `📋 ${m.senderName}: ${m.card?.title ?? "카드"}`;
    case "image":
      return `📷 ${m.senderName}: 사진`;
    case "file":
      return `📎 ${m.senderName}: ${m.media?.name ?? "파일"}`;
    default:
      return `${m.senderName}: ${m.text}`;
  }
};

/**
 * One ChatRoom Durable Object per room id. Holds the WebSocket connections and
 * message history (DO embedded SQLite). Hibernation API keeps idle rooms free.
 * Rich messages (image/file/system/card) ride the same store via kind+payload.
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
    // Idempotent migrations — add columns on existing rooms once each.
    for (const ddl of [
      "ALTER TABLE messages ADD COLUMN maskApplied INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE messages ADD COLUMN kind TEXT",
      "ALTER TABLE messages ADD COLUMN payload TEXT",
      "ALTER TABLE messages ADD COLUMN clientMsgId TEXT",
    ]) {
      try {
        ctx.storage.sql.exec(ddl);
      } catch {
        /* column already exists */
      }
    }
    // Idempotency key: a (sender, clientMsgId) pair maps to at most one stored
    // message, so a retried send can never create a duplicate row. Partial index
    // skips legacy/serverside messages that carry no clientMsgId.
    ctx.storage.sql.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_idem ON messages (senderId, clientMsgId) WHERE clientMsgId IS NOT NULL",
    );
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
    // Durable membership: everyone who has ever joined, so the inbox fan-out can
    // reach members who are currently OFFLINE (a connection list can't).
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS room_members (
        userId   TEXT PRIMARY KEY,
        name     TEXT NOT NULL,
        lastSeen INTEGER NOT NULL DEFAULT 0
      )`,
    );
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = (url.searchParams.get("user") ?? crypto.randomUUID()).slice(0, 64);
    const name = (url.searchParams.get("name") ?? "익명").slice(0, 32);
    const clientId = (url.searchParams.get("clientId") ?? crypto.randomUUID()).slice(0, 128);

    const roomId = url.pathname.match(/\/api\/room\/([^/]+)\/ws/)?.[1] ?? "unknown";
    await this.ctx.storage.put("roomId", roomId);

    // Record durable membership so offline members still get inbox fan-out.
    // The assistant is a virtual sender and never connects, so it's never added.
    this.ctx.storage.sql.exec(
      `INSERT INTO room_members (userId, name, lastSeen) VALUES (?, ?, ?)
       ON CONFLICT(userId) DO UPDATE SET name = excluded.name, lastSeen = excluded.lastSeen`,
      userId,
      name,
      Date.now(),
    );

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
      return;
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
        if (!this.allowSend(ws, att)) return;
        const original = event.text.trim().slice(0, 2000);
        if (!original) return;
        const masked = maskContact(original);
        const { message, deduped } = this.persist(att, {
          text: masked,
          kind: "text",
          maskApplied: original !== masked,
          clientMsgId: event.clientMsgId,
        });
        this.deliver(ws, message, deduped);
        // AI assistant: trigger only on a fresh message (not a dedup'd retry).
        if (!deduped) {
          const prompt = parseAssistantTrigger(original);
          if (prompt !== null) void this.runAssistantTurn(prompt);
        }
        break;
      }
      case "compose": {
        if (!this.allowSend(ws, att)) return;
        // Mask any text content (body of a card too) before it is stored/sent.
        const rawText = (event.text ?? "").slice(0, 2000);
        const maskedText = maskContact(rawText);
        const cardBody = event.card?.body ? maskContact(event.card.body) : event.card?.body;
        const card = event.card ? { ...event.card, body: cardBody } : undefined;
        const maskApplied =
          maskedText !== rawText || (!!event.card?.body && cardBody !== event.card.body);
        const { message, deduped } = this.persist(att, {
          text: maskedText,
          kind: event.kind,
          media: event.media,
          card,
          maskApplied,
          clientMsgId: event.clientMsgId,
        });
        this.deliver(ws, message, deduped);
        break;
      }
      case "action": {
        if (!this.allowSend(ws, att)) return;
        // Resolve the tapped card button's label, then emit a system message.
        const row = this.ctx.storage.sql
          .exec("SELECT payload FROM messages WHERE id = ?", event.messageId)
          .toArray()[0] as { payload?: string } | undefined;
        let label = event.actionId;
        if (row?.payload) {
          try {
            const p = JSON.parse(row.payload) as { card?: Card };
            label = p.card?.actions?.find((a) => a.id === event.actionId)?.label ?? label;
          } catch {
            /* ignore */
          }
        }
        const { message } = this.persist(att, {
          text: `${att.name}님이 "${label}"을(를) 선택했어요`,
          kind: "system",
          maskApplied: false,
        });
        this.broadcast({ type: "message", message });
        void this.reportToInboxes(message);
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
    void this.reportToHub(this.members().length > 0);
  }

  async webSocketError(): Promise<void> {
    this.broadcastPresence();
  }

  /** Read-only RPC for the admin console — wraps the private history query. */
  async adminRecentMessages(): Promise<Message[]> {
    return this.recentMessages();
  }

  /**
   * Run one AI assistant turn and broadcast its reply as a bot-authored message.
   * Best-effort: any failure inside `runAssistant` is swallowed there (returns a
   * text apology), so the chat is never blocked on the model. The bot is a virtual
   * sender — it has no socket, so it never appears in presence/members.
   */
  private async runAssistantTurn(prompt: string): Promise<void> {
    const bot = { senderId: ASSISTANT_ID, senderName: ASSISTANT_NAME };
    this.broadcast({ type: "typing", ...bot, isTyping: true });
    try {
      const reply = await runAssistant(this.env, this.recentMessages(), prompt);
      const { message } = this.persist(
        { userId: ASSISTANT_ID, name: ASSISTANT_NAME },
        { text: reply.text, kind: reply.kind, card: reply.card, maskApplied: false },
      );
      this.broadcast({ type: "message", message });
      void this.reportToInboxes(message);
      void this.reportToHub(true);
    } catch {
      /* assistant is best-effort; the chat keeps working without it */
    } finally {
      this.broadcast({ type: "typing", ...bot, isTyping: false });
    }
  }

  /** Sliding-window rate limit per connection. Returns false (and notifies) if over. */
  private allowSend(ws: WebSocket, att: Attachment): boolean {
    const now = Date.now();
    const recent = (att.sends ?? []).filter((t) => t > now - RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
      this.bump("rateLimitedCount");
      this.sendTo(ws, { type: "system", severity: "warn", reason: "rate_limited" });
      void this.reportToHub(true);
      return false;
    }
    recent.push(now);
    ws.serializeAttachment({ ...att, sends: recent } satisfies Attachment);
    return true;
  }

  /**
   * Insert a message (any kind), assign seq (rowid), trim TTL, bump counters.
   * Idempotent on (senderId, clientMsgId): because delivery is at-least-once, a
   * client may resend after a missed ack. If this clientMsgId is already stored
   * for this sender we echo the stored message (same id+seq) and report
   * `deduped: true`, so a retry is effectively-once — no duplicate row.
   */
  private persist(
    sender: { userId: string; name: string },
    parts: {
      text: string;
      kind: Message["kind"];
      media?: Media;
      card?: Card;
      maskApplied: boolean;
      clientMsgId?: string;
    },
  ): { message: Message; deduped: boolean } {
    if (parts.clientMsgId) {
      const existing = this.ctx.storage.sql
        .exec(
          `SELECT ${HISTORY_COLS} FROM messages WHERE senderId = ? AND clientMsgId = ? LIMIT 1`,
          sender.userId,
          parts.clientMsgId,
        )
        .toArray()[0] as unknown as Row | undefined;
      if (existing) {
        console.log(JSON.stringify({ evt: "dedup", seq: Number(existing.seq) }));
        return { message: rowToMessage(existing), deduped: true };
      }
    }

    const now = Date.now();
    const id = crypto.randomUUID();
    const payload =
      parts.media || parts.card ? JSON.stringify({ media: parts.media, card: parts.card }) : null;
    this.ctx.storage.sql.exec(
      "INSERT INTO messages (id, senderId, senderName, text, ts, maskApplied, kind, payload, clientMsgId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      sender.userId,
      sender.name,
      parts.text,
      now,
      parts.maskApplied ? 1 : 0,
      parts.kind ?? "text",
      payload,
      parts.clientMsgId ?? null,
    );
    const seq = Number(
      (this.ctx.storage.sql.exec("SELECT last_insert_rowid() AS s").one() as { s: number }).s,
    );
    this.ctx.storage.sql.exec("DELETE FROM messages WHERE ts < ?", now - HISTORY_TTL_MS);
    this.bump("messageCount");
    if (parts.maskApplied) this.bump("maskedCount");
    console.log(JSON.stringify({ evt: "msg", kind: parts.kind, masked: parts.maskApplied, seq }));
    return {
      message: {
        id,
        senderId: sender.userId,
        senderName: sender.name,
        text: parts.text,
        ts: now,
        maskApplied: parts.maskApplied,
        seq,
        kind: parts.kind ?? "text",
        media: parts.media,
        card: parts.card,
        clientMsgId: parts.clientMsgId,
      },
      deduped: false,
    };
  }

  /**
   * Fan a stored message out to the room. A deduped retry is echoed only to the
   * sender — everyone else already received the original — so it reconciles the
   * sender's optimistic bubble without re-notifying the whole room.
   */
  private deliver(ws: WebSocket, message: Message, deduped: boolean): void {
    if (deduped) {
      this.sendTo(ws, { type: "message", message });
    } else {
      this.broadcast({ type: "message", message });
      void this.reportToInboxes(message); // fresh message only — no double-count on retry
    }
    void this.reportToHub(true);
  }

  /**
   * Fan a fire-and-forget update out to each member's UserInbox DO. The sender's
   * inbox updates the preview without bumping unread; everyone else gets +1.
   * Fans out to DURABLE members (everyone who ever joined), so an offline member
   * still accrues unread. Best-effort: the chat is authoritative, inbox secondary.
   */
  private async reportToInboxes(message: Message): Promise<void> {
    try {
      const roomId = (await this.ctx.storage.get<string>("roomId")) ?? "unknown";
      const preview = inboxPreview(message);
      await Promise.all(
        this.persistentMembers().map((m) =>
          this.env.USER_INBOX.getByName(m.id).recordMessage(
            roomId,
            preview,
            message.ts,
            m.id === message.senderId,
          ),
        ),
      );
    } catch {
      /* inbox visibility is best-effort */
    }
  }

  private bump(col: StatColumn): void {
    this.ctx.storage.sql.exec(`UPDATE room_stats SET ${col} = ${col} + 1 WHERE id = 1`);
  }

  private readStats(): Stats {
    return this.ctx.storage.sql
      .exec(
        "SELECT messageCount, maskedCount, rateLimitedCount, reconnectCount FROM room_stats WHERE id = 1",
      )
      .one() as unknown as Stats;
  }

  private async reportToHub(active: boolean): Promise<void> {
    try {
      const roomId = (await this.ctx.storage.get<string>("roomId")) ?? "unknown";
      await this.env.ADMIN_HUB.getByName("global").reportSnapshot(roomId, active, {
        members: this.members().length,
        ...this.readStats(),
      });
    } catch {
      /* admin visibility is best-effort */
    }
  }

  private recentMessages(): Message[] {
    const cutoff = Date.now() - HISTORY_TTL_MS;
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT ${HISTORY_COLS} FROM messages WHERE ts >= ? ORDER BY rowid DESC LIMIT ?`,
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
        `SELECT ${HISTORY_COLS} FROM messages WHERE ts >= ? AND rowid < ? ORDER BY rowid DESC LIMIT ?`,
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

  /** Everyone who has ever joined (connected or not) — used for inbox fan-out. */
  private persistentMembers(): Member[] {
    const rows = this.ctx.storage.sql
      .exec("SELECT userId, name FROM room_members")
      .toArray() as unknown as { userId: string; name: string }[];
    return rows.map((r) => ({ id: r.userId, name: r.name }));
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
