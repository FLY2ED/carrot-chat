// Shared event model used by BOTH the client SDK and the Durable Object worker.
// The Zod schemas (single source of truth) live in ./protocol; this module
// re-exports the inferred types plus the framework-agnostic connection status.

export type { ClientEvent, Member, Message, ServerEvent } from "./protocol";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";
