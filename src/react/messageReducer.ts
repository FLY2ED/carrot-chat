import type { Message } from "../chat-core";

// Pure message-list reducers — no React, no store, no clock — so the optimistic
// state machine and ordering can be unit-tested in milliseconds.

/**
 * Stable total order: server `seq` (SQLite rowid) when known, else fall back to
 * `ts` then `id`. Optimistic messages have no `seq` → they sink to the end until
 * the echo arrives with a real seq and slots them into place.
 */
function compare(a: Message, b: Message): number {
  const as = a.seq ?? Number.MAX_SAFE_INTEGER;
  const bs = b.seq ?? Number.MAX_SAFE_INTEGER;
  if (as !== bs) return as - bs;
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sorted(messages: Message[]): Message[] {
  return [...messages].sort(compare);
}

/** Add a locally-created `sending` message immediately (before the server echo). */
export function applyOptimistic(messages: Message[], optimistic: Message): Message[] {
  return sorted([...messages, optimistic]);
}

/**
 * Reconcile an incoming server message:
 *  1. if it echoes one of our optimistic sends (same clientMsgId), replace it
 *     in place with the authoritative server version (no duplicate bubble);
 *  2. otherwise dedup by id (others' messages, multi-tab/reconnect echoes).
 */
export function reconcileEcho(messages: Message[], incoming: Message): Message[] {
  if (incoming.clientMsgId) {
    const idx = messages.findIndex(
      (m) => m.clientMsgId === incoming.clientMsgId && m.status === "sending",
    );
    if (idx !== -1) {
      const next = [...messages];
      next[idx] = incoming; // server is authoritative; status drops to undefined (= confirmed)
      return sorted(next);
    }
  }
  if (messages.some((m) => m.id === incoming.id)) return messages;
  return sorted([...messages, incoming]);
}

/** Flip a still-pending optimistic message to `failed` (timeout / server error). */
export function markFailed(messages: Message[], clientMsgId: string): Message[] {
  return messages.map((m) =>
    m.clientMsgId === clientMsgId && m.status === "sending" ? { ...m, status: "failed" } : m,
  );
}

/**
 * Merge a fresh server history snapshot (from `hello` on reconnect) while
 * preserving still-pending optimistic messages — otherwise a reconnect would
 * wipe a message the user just sent but the server hasn't echoed yet.
 */
export function mergeHistory(prev: Message[], history: Message[]): Message[] {
  const serverIds = new Set(history.map((m) => m.id));
  const pending = prev.filter(
    (m) => (m.status === "sending" || m.status === "failed") && !serverIds.has(m.id),
  );
  return sorted([...history, ...pending]);
}

/** Prepend an older page (infinite scroll) without duplicates, keeping order. */
export function prependPage(messages: Message[], page: Message[]): Message[] {
  const have = new Set(messages.map((m) => m.id));
  const fresh = page.filter((m) => !have.has(m.id));
  return sorted([...fresh, ...messages]);
}
