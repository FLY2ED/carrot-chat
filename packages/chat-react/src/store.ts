import { createStore } from "zustand/vanilla";
import type { ConnectionStatus, Member, Message } from "@naldadev/chat";

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
  /** Most recent system-event notice (rate-limit, validation, etc.). Auto-clears. */
  notice: string | null;
  /** Whether older history pages remain above the current window. */
  hasMoreHistory: boolean;
  /** Guards against overlapping history_request round-trips. */
  loadingOlder: boolean;
}

export const initialChatState: ChatState = {
  status: "connecting",
  selfId: null,
  selfName: null,
  messages: [],
  members: [],
  typing: {},
  reads: {},
  notice: null,
  hasMoreHistory: false,
  loadingOlder: false,
};

/** A fresh store per room instance (one per ChatPanel / connection). */
export const createChatStore = () =>
  createStore<ChatState>(() => ({ ...initialChatState }));

export type ChatStore = ReturnType<typeof createChatStore>;
