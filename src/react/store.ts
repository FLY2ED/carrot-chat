import { createStore } from "zustand/vanilla";
import type { ConnectionStatus, Member, Message } from "../chat-core/types";

export interface ChatState {
  status: ConnectionStatus;
  selfId: string | null;
  selfName: string | null;
  messages: Message[];
  members: Member[];
  /** userId → display name, for members currently typing. */
  typing: Record<string, string>;
  /** readerId → id of the last message they have read. */
  reads: Record<string, string>;
}

export const initialChatState: ChatState = {
  status: "connecting",
  selfId: null,
  selfName: null,
  messages: [],
  members: [],
  typing: {},
  reads: {},
};

/** A fresh store per room instance (one per ChatPanel / connection). */
export const createChatStore = () =>
  createStore<ChatState>(() => ({ ...initialChatState }));

export type ChatStore = ReturnType<typeof createChatStore>;
