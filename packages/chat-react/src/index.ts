// Public API of the React bindings for @naldadev/chat.
//
// Headless on purpose: this package gives you the hook + state primitives, not
// UI components. Render however you like (see examples/ in the repo).

export { useChatRoom, buildWsUrl } from "./useChatRoom";
export { getClientId } from "./clientId";
export {
  applyOptimistic,
  reconcileEcho,
  markFailed,
  mergeHistory,
  prependPage,
} from "./messageReducer";
export { createChatStore, initialChatState } from "./store";
export type { ChatState, ChatStore } from "./store";
