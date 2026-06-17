import { useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { ChatClient } from "../chat-core/client";
import { createChatStore } from "./store";

export function buildWsUrl(roomId: string, user: string, name: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const qs = new URLSearchParams({ user, name }).toString();
  return `${proto}//${location.host}/api/room/${encodeURIComponent(roomId)}/ws?${qs}`;
}

const NOTICE_FOR = (reason: string, detail?: string): string => {
  switch (reason) {
    case "rate_limited":
      return "메시지 속도 제한 — 잠시 후 다시 시도해 주세요";
    case "validation_failed":
      return `잘못된 입력: ${detail ?? "프로토콜 검증 실패"}`;
    default:
      return detail ?? "정책이 적용되었습니다";
  }
};

const NOTICE_AUTOCLEAR_MS = 3000;
const RECONNECT_SIM_VISIBLE_MS = 1500;

/**
 * Binds a {@link ChatClient} to a per-instance Zustand store and exposes the
 * reactive state plus stable action callbacks. The SDK does the work; React
 * just renders it.
 */
export function useChatRoom(roomId: string, user: string, name: string) {
  const storeRef = useRef(createChatStore());
  const store = storeRef.current;
  const clientRef = useRef<ChatClient | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        case "system":
          store.setState({ notice: NOTICE_FOR(event.reason, event.detail) });
          // Replace any in-flight clear so the newest notice survives long enough.
          if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
          noticeTimerRef.current = setTimeout(() => {
            store.setState({ notice: null });
            noticeTimerRef.current = null;
          }, NOTICE_AUTOCLEAR_MS);
          break;
      }
    });

    client.connect();
    return () => {
      off();
      offStatus();
      client.close();
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
    };
  }, [roomId, user, name, store]);

  const state = useStore(store);

  const actions = useMemo(
    () => ({
      sendMessage: (text: string) => clientRef.current?.send({ type: "send", text }),
      setTyping: (isTyping: boolean) =>
        clientRef.current?.send({ type: "typing", isTyping }),
      markRead: (messageId: string) =>
        clientRef.current?.send({ type: "read", messageId }),
      simulateDisconnect: () =>
        clientRef.current?.simulateDisconnect({
          minReconnectDelayMs: RECONNECT_SIM_VISIBLE_MS,
        }),
    }),
    [],
  );

  return { ...state, ...actions };
}
