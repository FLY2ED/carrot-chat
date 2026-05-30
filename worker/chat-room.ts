import { DurableObject } from "cloudflare:workers";
import { maskContact } from "../src/chat-core/protocol";
import type {
  ClientEvent,
  Member,
  Message,
  ServerEvent,
} from "../src/chat-core/types";

/** Per-connection data that must survive WebSocket hibernation. */
interface Attachment {
  userId: string;
  name: string;
}

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
    // The runtime answers "ping" with "pong" without waking the object.
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
    server.serializeAttachment({ userId, name } satisfies Attachment);

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
    let event: ClientEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      return; // ignore non-JSON frames (e.g. a stray "pong")
    }
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;

    switch (event.type) {
      case "send": {
        // Policy control: strip phone/email/contact handles (off-platform deals).
        const text = maskContact(event.text).trim().slice(0, 2000);
        if (!text) return;
        const message: Message = {
          id: crypto.randomUUID(),
          senderId: att.userId,
          senderName: att.name,
          text,
          ts: Date.now(),
        };
        this.ctx.storage.sql.exec(
          "INSERT INTO messages (id, senderId, senderName, text, ts) VALUES (?, ?, ?, ?, ?)",
          message.id,
          message.senderId,
          message.senderName,
          message.text,
          message.ts,
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

  async webSocketClose(): Promise<void> {
    this.broadcastPresence();
  }

  async webSocketError(): Promise<void> {
    this.broadcastPresence();
  }

  private recentMessages(): Message[] {
    const rows = this.ctx.storage.sql
      .exec("SELECT id, senderId, senderName, text, ts FROM messages ORDER BY ts DESC LIMIT 100")
      .toArray() as unknown as Message[];
    return rows.reverse();
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
