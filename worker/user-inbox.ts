import { DurableObject } from "cloudflare:workers";
import { InboxClientEventSchema, type InboxRoom, type InboxServerEvent } from "../src/inbox/protocol";

interface InboxRow {
  roomId: string;
  lastText: string;
  lastTs: number;
  unread: number;
  favorite: number;
}

/**
 * One UserInbox Durable Object per user id. Aggregates the rooms a user is in,
 * with unread counts + last-message previews. ChatRoom fans out a fire-and-forget
 * `recordMessage` RPC to each member's inbox; the inbox page holds a WebSocket and
 * receives a fresh snapshot whenever anything changes (mirrors the ChatRoom DO).
 */
export class UserInbox extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS rooms (
        roomId   TEXT PRIMARY KEY,
        lastText TEXT NOT NULL DEFAULT '',
        lastTs   INTEGER NOT NULL DEFAULT 0,
        unread   INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0
      )`,
    );
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.sendTo(server, this.snapshot());
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = InboxClientEventSchema.safeParse(payload);
    if (!parsed.success) return;
    const event = parsed.data;
    if (event.type === "read") {
      this.ctx.storage.sql.exec("UPDATE rooms SET unread = 0 WHERE roomId = ?", event.roomId);
    } else {
      this.ctx.storage.sql.exec(
        "UPDATE rooms SET favorite = 1 - favorite WHERE roomId = ?",
        event.roomId,
      );
    }
    this.broadcast();
  }

  /**
   * Called by a ChatRoom DO when a message lands. Upserts the room preview and
   * bumps unread for everyone except the sender, then pushes a fresh snapshot.
   */
  async recordMessage(roomId: string, text: string, ts: number, fromSelf: boolean): Promise<void> {
    const inc = fromSelf ? 0 : 1;
    this.ctx.storage.sql.exec(
      `INSERT INTO rooms (roomId, lastText, lastTs, unread)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(roomId) DO UPDATE SET
         lastText = excluded.lastText,
         lastTs   = excluded.lastTs,
         unread   = rooms.unread + ?`,
      roomId,
      text.slice(0, 200),
      ts,
      inc,
      inc,
    );
    this.broadcast();
  }

  private rooms(): InboxRoom[] {
    const rows = this.ctx.storage.sql
      .exec("SELECT roomId, lastText, lastTs, unread, favorite FROM rooms ORDER BY favorite DESC, lastTs DESC")
      .toArray() as unknown as InboxRow[];
    return rows.map((r) => ({
      roomId: r.roomId,
      lastText: r.lastText,
      lastTs: Number(r.lastTs),
      unread: Number(r.unread),
      favorite: r.favorite === 1,
    }));
  }

  private snapshot(): InboxServerEvent {
    return { type: "inbox", rooms: this.rooms() };
  }

  private sendTo(ws: WebSocket, event: InboxServerEvent): void {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      /* socket already gone */
    }
  }

  private broadcast(): void {
    const data = JSON.stringify(this.snapshot());
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* socket already gone */
      }
    }
  }
}
