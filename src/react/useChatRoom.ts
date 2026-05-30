import { useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { ChatClient } from "../chat-core/client";
import { createChatStore } from "./store";

export function buildWsUrl(roomId: string, user: string, name: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const qs = new URLSearchParams({ user, name }).toString();
  return `${proto}//${location.host}/api/room/${encodeURIComponent(roomId)}/ws?${qs}`;
}

/**
 * Binds a {@link ChatClient} to a per-instance Zustand store and exposes the
 * reactive state plus stable action callbacks. The SDK does the work; React
 * just renders it.
 */
export function useChatRoom(roomId: string, user: string, name: string) {
  const storeRef = useRef(createChatStore());
  const store = storeRef.current;
  const clientRef = useRef<ChatClient | null>(null);

  useEffect(() => {
    const client = new ChatClient({ url: buildWsUrl(roomId, user, name) });
    clientRef.current = client;

    const offStatus = client.onStatus((status) => store.setState({ status }));
    const off = client.on((event) => {
      switch (event.type) {
        case "hello":
          store.setState({
            selfId: event.selfId,
            selfName: event.selfName,
            messages: event.history,
            members: event.members,
          });
          break;
        case "message":
          store.setState((s) =>
            s.messages.some((m) => m.id === event.message.id)
              ? s
              : { messages: [...s.messages, event.message] },
          );
          break;
        case "presence":
          store.setState({ members: event.members });
          break;
        case "typing":
          store.setState((s) => {
            const typing = { ...s.typing };
            if (event.isTyping) typing[event.senderId] = event.senderName;
            else delete typing[event.senderId];
            return { typing };
          });
          break;
        case "read":
          store.setState((s) => ({
            reads: { ...s.reads, [event.readerId]: event.messageId },
          }));
          break;
      }
    });

    client.connect();
    return () => {
      off();
      offStatus();
      client.close();
    };
  }, [roomId, user, name, store]);

  const state = useStore(store);

  const actions = useMemo(
    () => ({
      sendMessage: (text: string) => clientRef.current?.send({ type: "send", text }),
      setTyping: (isTyping: boolean) => clientRef.current?.send({ type: "typing", isTyping }),
      markRead: (messageId: string) => clientRef.current?.send({ type: "read", messageId }),
    }),
    [],
  );

  return { ...state, ...actions };
}
