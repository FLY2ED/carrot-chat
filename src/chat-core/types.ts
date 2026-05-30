// Shared event model used by BOTH the client SDK and the Durable Object worker.
// Keeping it framework-agnostic is what makes the SDK reusable.

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
  /** True when the server applied the contact-masking policy to this message. */
  maskApplied?: boolean;
}

export interface Member {
  id: string;
  name: string;
}

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

// ClientEvent is defined alongside its Zod schema in ./protocol.
export type { ClientEvent } from "./protocol";

/** Events the server broadcasts to clients. */
export type ServerEvent =
  | { type: "hello"; selfId: string; selfName: string; history: Message[]; members: Member[] }
  | { type: "message"; message: Message }
  | { type: "typing"; senderId: string; senderName: string; isTyping: boolean }
  | { type: "read"; messageId: string; readerId: string }
  | { type: "presence"; members: Member[] }
  | { type: "system"; severity: "info" | "warn"; reason: string; detail?: string };
