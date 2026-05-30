import { nextDelay, withJitter } from "./reconnect";
import type { ClientEvent, ConnectionStatus, ServerEvent } from "./types";

type EventListener = (event: ServerEvent) => void;
type StatusListener = (status: ConnectionStatus) => void;

export interface ChatClientOptions {
  url: string;
  /** Injectable for tests (defaults to the global WebSocket). */
  WebSocketCtor?: typeof WebSocket;
  maxReconnectAttempts?: number;
  heartbeatMs?: number;
  rng?: () => number;
}

/**
 * Framework-agnostic chat connection: owns a WebSocket, auto-reconnects with
 * exponential backoff + jitter, keeps the connection warm with heartbeats, and
 * fans typed events out to subscribers. No React, no DOM assumptions.
 */
export class ChatClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "closed";
  private attempt = 0;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<EventListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly opts: Required<ChatClientOptions>;

  constructor(options: ChatClientOptions) {
    this.opts = {
      WebSocketCtor: globalThis.WebSocket,
      maxReconnectAttempts: Number.POSITIVE_INFINITY,
      heartbeatMs: 25_000,
      rng: Math.random,
      ...options,
    };
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    this.intentionalClose = false;
    this.open();
  }

  private open(): void {
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    const ws = new this.opts.WebSocketCtor(this.opts.url);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.attempt = 0;
      this.setStatus("open");
      this.startHeartbeat();
    });

    ws.addEventListener("message", (ev: MessageEvent) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      if (!raw || raw === "pong") return;
      let event: ServerEvent;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }
      for (const listener of this.listeners) listener(event);
    });

    ws.addEventListener("close", () => {
      this.stopHeartbeat();
      if (this.intentionalClose) {
        this.setStatus("closed");
        return;
      }
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.attempt >= this.opts.maxReconnectAttempts) {
      this.setStatus("closed");
      return;
    }
    this.setStatus("reconnecting");
    const delay = withJitter(nextDelay(this.attempt), this.opts.rng);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  send(event: ClientEvent): void {
    if (this.ws && this.status === "open") {
      this.ws.send(JSON.stringify(event));
    }
  }

  on(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    try {
      this.ws?.close(1000, "client closed");
    } catch {
      /* noop */
    }
    this.setStatus("closed");
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.status === "open") this.ws.send("ping");
    }, this.opts.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
