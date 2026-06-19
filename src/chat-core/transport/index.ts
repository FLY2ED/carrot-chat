// Transport abstraction: the narrow surface ChatClient needs from a connection.
// Lets the SDK swap WebSocket for SSE/long-polling without touching client logic.

export type TransportState = "connecting" | "open" | "closed";

export interface TransportEvents {
  open: () => void;
  /** One text frame received. Binary frames are coerced to "" by the adapter. */
  message: (data: string) => void;
  close: (info?: { code?: number; reason?: string }) => void;
  error: (err?: unknown) => void;
}

export interface Transport {
  connect(): void;
  send(data: string): void;
  /** Register a handler; returns an unsubscribe function (mirrors client.on). */
  on<K extends keyof TransportEvents>(type: K, handler: TransportEvents[K]): () => void;
  close(code?: number, reason?: string): void;
  readonly state: TransportState;
}

/** Builds a Transport from a url. ChatClient calls this once per (re)connection. */
export type TransportFactory = (url: string) => Transport;

export { webSocketTransport } from "./websocket";
export type { WebSocketTransportOptions } from "./websocket";
