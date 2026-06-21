// Public API of the framework-agnostic chat SDK (publishable as @naldadev/chat).
//
// This barrel IS the SDK's contract: consumers (the React bindings, the Worker)
// import only from here, never from internal files. That keeps the surface small
// and lets internals (reconnect policy, store wiring) change without breaking users.
// See ./README.md for the package extraction plan and quickstart.

export { ChatClient } from "./client";
export type { ChatClientOptions } from "./client";

export { webSocketTransport } from "./transport";
export type {
  Transport,
  TransportFactory,
  TransportEvents,
  TransportState,
  WebSocketTransportOptions,
} from "./transport";

export {
  ClientEventSchema,
  ServerEventSchema,
  MessageSchema,
  MemberSchema,
  MediaSchema,
  CardSchema,
  CardActionSchema,
  maskContact,
} from "./protocol";

export type {
  ClientEvent,
  ServerEvent,
  Message,
  Member,
  ConnectionStatus,
  Media,
  Card,
} from "./types";

// `nextDelay` / `withJitter` (reconnect policy) are intentionally NOT exported —
// they are an internal implementation detail of ChatClient.
