import { describe, expect, it } from "vitest";
import {
  applyOptimistic,
  markFailed,
  mergeHistory,
  prependPage,
  reconcileEcho,
} from "./messageReducer";
import type { Message } from "@naldadev/chat";

const msg = (over: Partial<Message>): Message => ({
  id: "x",
  senderId: "a",
  senderName: "A",
  text: "hi",
  ts: 1,
  ...over,
});

describe("messageReducer", () => {
  it("applyOptimistic appends a sending message at the end", () => {
    const base = [msg({ id: "1", seq: 1 })];
    const next = applyOptimistic(base, msg({ id: "c1", clientMsgId: "c1", status: "sending", ts: 9 }));
    expect(next).toHaveLength(2);
    expect(next.at(-1)?.clientMsgId).toBe("c1");
  });

  it("reconcileEcho replaces the optimistic bubble by clientMsgId without duplicating", () => {
    const optimistic = msg({ id: "c1", clientMsgId: "c1", status: "sending", ts: 9 });
    const echo = msg({ id: "server-1", clientMsgId: "c1", seq: 5, ts: 9 });
    const next = reconcileEcho([msg({ id: "1", seq: 1 }), optimistic], echo);
    expect(next).toHaveLength(2);
    const reconciled = next.find((m) => m.clientMsgId === "c1");
    expect(reconciled?.id).toBe("server-1");
    expect(reconciled?.status).toBeUndefined(); // confirmed
  });

  it("reconcileEcho dedups others' messages by id", () => {
    const base = [msg({ id: "server-1", seq: 1 })];
    const same = reconcileEcho(base, msg({ id: "server-1", seq: 1 }));
    expect(same).toHaveLength(1);
    const added = reconcileEcho(base, msg({ id: "server-2", seq: 2 }));
    expect(added).toHaveLength(2);
  });

  it("markFailed flips a pending message to failed", () => {
    const base = [msg({ id: "c1", clientMsgId: "c1", status: "sending" })];
    expect(markFailed(base, "c1")[0].status).toBe("failed");
    // already-sent messages are untouched
    const sent = [msg({ id: "c1", clientMsgId: "c1" })];
    expect(markFailed(sent, "c1")[0].status).toBeUndefined();
  });

  it("mergeHistory preserves pending optimistic messages on reconnect", () => {
    const prev = [
      msg({ id: "1", seq: 1 }),
      msg({ id: "c1", clientMsgId: "c1", status: "sending", ts: 99 }),
    ];
    const history = [msg({ id: "1", seq: 1 }), msg({ id: "2", seq: 2 })];
    const merged = mergeHistory(prev, history);
    expect(merged.map((m) => m.id)).toContain("c1"); // optimistic survived
    expect(merged.filter((m) => m.id === "1")).toHaveLength(1); // no dup
  });

  it("prependPage adds older messages without dup, ordered by seq", () => {
    const current = [msg({ id: "3", seq: 3 }), msg({ id: "4", seq: 4 })];
    const page = [msg({ id: "1", seq: 1 }), msg({ id: "3", seq: 3 })];
    const next = prependPage(current, page);
    expect(next.map((m) => m.seq)).toEqual([1, 3, 4]);
  });
});
