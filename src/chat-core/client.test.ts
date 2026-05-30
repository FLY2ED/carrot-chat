import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatClient } from "./client";
import type { ServerEvent } from "./types";

/** Minimal WebSocket stand-in we can drive synchronously from tests. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  readonly sent: string[] = [];
  closed = false;
  private listeners: Record<string, ((ev: unknown) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.emit("close", {});
  }

  emit(type: string, ev: unknown) {
    (this.listeners[type] ?? []).forEach((cb) => cb(ev));
  }
  open() {
    this.emit("open", {});
  }
  message(data: string) {
    this.emit("message", { data });
  }
}

const makeClient = (overrides = {}) => {
  FakeWebSocket.instances = [];
  return new ChatClient({
    url: "ws://test/api/room/x/ws",
    WebSocketCtor: FakeWebSocket as unknown as typeof WebSocket,
    rng: () => 0.5,
    ...overrides,
  });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ChatClient", () => {
  it("reports connecting → open and forwards parsed events", () => {
    const client = makeClient();
    const events: ServerEvent[] = [];
    client.on((e) => events.push(e));
    client.connect();
    expect(client.connectionStatus).toBe("connecting");

    const ws = FakeWebSocket.instances[0];
    ws.open();
    expect(client.connectionStatus).toBe("open");

    ws.message(JSON.stringify({ type: "presence", members: [{ id: "a", name: "A" }] }));
    expect(events).toEqual([{ type: "presence", members: [{ id: "a", name: "A" }] }]);
  });

  it("ignores non-JSON frames such as heartbeat pongs", () => {
    const client = makeClient();
    const events: ServerEvent[] = [];
    client.on((e) => events.push(e));
    client.connect();
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].message("pong");
    expect(events).toHaveLength(0);
  });

  it("auto-reconnects after an unexpected close", () => {
    const client = makeClient();
    client.connect();
    FakeWebSocket.instances[0].open();

    // Server drops the connection unexpectedly.
    FakeWebSocket.instances[0].emit("close", {});
    expect(client.connectionStatus).toBe("reconnecting");

    // Backoff for attempt 0 = 500ms (jitter neutralised by rng 0.5).
    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("does not reconnect after an intentional close()", () => {
    const client = makeClient();
    client.connect();
    FakeWebSocket.instances[0].open();
    client.close();
    expect(client.connectionStatus).toBe("closed");

    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("sends heartbeat pings while open", () => {
    const client = makeClient({ heartbeatMs: 1000 });
    client.connect();
    const ws = FakeWebSocket.instances[0];
    ws.open();
    vi.advanceTimersByTime(1000);
    expect(ws.sent).toContain("ping");
  });
});
