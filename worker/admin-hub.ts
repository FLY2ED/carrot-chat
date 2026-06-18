import { DurableObject } from "cloudflare:workers";

// A single global Durable Object (getByName("global")) that aggregates room
// lifecycle + stats reported by each ChatRoom. This is what makes a "list of
// active rooms" possible — individual ChatRooms have no global view of each other.
// ChatRoom reports here fire-and-forget, so the admin console never sits on the
// chat hot path.

export interface AdminSnapshot {
  members: number;
  messageCount: number;
  maskedCount: number;
  rateLimitedCount: number;
  reconnectCount: number;
}

export interface RoomSummary extends AdminSnapshot {
  roomId: string;
  active: boolean;
  lastActive: number;
}

export interface GlobalStats {
  rooms: number;
  activeRooms: number;
  totalMessages: number;
  totalMasked: number;
  totalRateLimited: number;
  totalReconnects: number;
  /** Share of messages that triggered the contact-masking policy (0–1). */
  maskRate: number;
}

interface RoomRow extends AdminSnapshot {
  roomId: string;
  active: number;
  lastActive: number;
}

const toSummary = (r: RoomRow): RoomSummary => ({
  roomId: r.roomId,
  active: r.active === 1,
  members: r.members,
  messageCount: r.messageCount,
  maskedCount: r.maskedCount,
  rateLimitedCount: r.rateLimitedCount,
  reconnectCount: r.reconnectCount,
  lastActive: r.lastActive,
});

export class AdminHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS rooms (
        roomId           TEXT PRIMARY KEY,
        active           INTEGER NOT NULL DEFAULT 0,
        members          INTEGER NOT NULL DEFAULT 0,
        messageCount     INTEGER NOT NULL DEFAULT 0,
        maskedCount      INTEGER NOT NULL DEFAULT 0,
        rateLimitedCount INTEGER NOT NULL DEFAULT 0,
        reconnectCount   INTEGER NOT NULL DEFAULT 0,
        lastActive       INTEGER NOT NULL DEFAULT 0
      )`,
    );
  }

  /** RPC: a ChatRoom reports its current lifecycle + counters. Upsert by roomId. */
  async reportSnapshot(roomId: string, active: boolean, s: AdminSnapshot): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT INTO rooms (roomId, active, members, messageCount, maskedCount, rateLimitedCount, reconnectCount, lastActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(roomId) DO UPDATE SET
         active = excluded.active,
         members = excluded.members,
         messageCount = excluded.messageCount,
         maskedCount = excluded.maskedCount,
         rateLimitedCount = excluded.rateLimitedCount,
         reconnectCount = excluded.reconnectCount,
         lastActive = excluded.lastActive`,
      roomId,
      active ? 1 : 0,
      s.members,
      s.messageCount,
      s.maskedCount,
      s.rateLimitedCount,
      s.reconnectCount,
      Date.now(),
    );
  }

  async getRooms(): Promise<RoomSummary[]> {
    const rows = this.ctx.storage.sql
      .exec("SELECT * FROM rooms ORDER BY lastActive DESC LIMIT 200")
      .toArray() as unknown as RoomRow[];
    return rows.map(toSummary);
  }

  async getStats(): Promise<GlobalStats> {
    const rows = this.ctx.storage.sql
      .exec("SELECT * FROM rooms")
      .toArray() as unknown as RoomRow[];
    const totalMessages = rows.reduce((a, r) => a + r.messageCount, 0);
    const totalMasked = rows.reduce((a, r) => a + r.maskedCount, 0);
    return {
      rooms: rows.length,
      activeRooms: rows.filter((r) => r.active === 1).length,
      totalMessages,
      totalMasked,
      totalRateLimited: rows.reduce((a, r) => a + r.rateLimitedCount, 0),
      totalReconnects: rows.reduce((a, r) => a + r.reconnectCount, 0),
      maskRate: totalMessages ? totalMasked / totalMessages : 0,
    };
  }
}
