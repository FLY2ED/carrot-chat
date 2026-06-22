import type { Transport, TransportEvents, TransportState } from "./index";

export interface WebSocketTransportOptions {
  /** Injectable constructor for tests (defaults to globalThis.WebSocket). */
  WebSocketCtor?: typeof WebSocket;
}

/**
 * Default Transport: a thin wrapper that maps WebSocket events onto `on()`.
 * Heartbeat / reconnect / backoff stay in ChatClient (transport-agnostic policy)
 * so that a future SSE transport — which has no `send` — still fits this surface.
 */
export function webSocketTransport(
  url: string,
  opts: WebSocketTransportOptions = {},
): Transport {
  const Ctor = opts.WebSocketCtor ?? globalThis.WebSocket;
  let ws: WebSocket | null = null;
  let state: TransportState = "closed";

  const listeners = {
    open: new Set<TransportEvents["open"]>(),
    message: new Set<TransportEvents["message"]>(),
    close: new Set<TransportEvents["close"]>(),
    error: new Set<TransportEvents["error"]>(),
  };

  return {
    get state() {
      return state;
    },
    connect() {
      state = "connecting";
      ws = new Ctor(url);
      ws.addEventListener("open", () => {
        state = "open";
        for (const h of listeners.open) h();
      });
      ws.addEventListener("message", (ev: MessageEvent) => {
        const data = typeof ev.data === "string" ? ev.data : "";
        for (const h of listeners.message) h(data);
      });
      ws.addEventListener("close", (ev: CloseEvent) => {
        state = "closed";
        for (const h of listeners.close) h({ code: ev.code, reason: ev.reason });
      });
      ws.addEventListener("error", (err) => {
        for (const h of listeners.error) h(err);
      });
    },
    send(data: string) {
      ws?.send(data);
    },
    on<K extends keyof TransportEvents>(type: K, handler: TransportEvents[K]): () => void {
      const set = listeners[type] as Set<TransportEvents[K]>;
      set.add(handler);
      return () => set.delete(handler);
    },
    close(code?: number, reason?: string) {
      try {
        ws?.close(code, reason);
      } catch {
        /* socket already gone */
      }
    },
  };
}
