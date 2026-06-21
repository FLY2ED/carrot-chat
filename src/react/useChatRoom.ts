import { useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import { ChatClient } from "../chat-core";
import { createChatStore } from "./store";
import { getClientId } from "./clientId";
import {
  applyOptimistic,
  markFailed,
  mergeHistory,
  prependPage,
  reconcileEcho,
} from "./messageReducer";
import type { Card, Media, Message } from "../chat-core";

export function buildWsUrl(
  roomId: string,
  user: string,
  name: string,
  clientId: string,
): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const qs = new URLSearchParams({ user, name, clientId }).toString();
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
const SEND_TIMEOUT_MS = 8000;
const HISTORY_PAGE_SIZE = 50;

/**
 * Binds a {@link ChatClient} to a per-instance Zustand store and exposes the
 * reactive state plus stable action callbacks. The SDK does the transport work;
 * React renders it. Optimistic sends, reconnect-safe history merge, and infinite
 * scroll are handled here via the pure {@link messageReducer} helpers.
 */
export function useChatRoom(roomId: string, user: string, name: string) {
  const storeRef = useRef(createChatStore());
  const store = storeRef.current;
  const clientRef = useRef<ChatClient | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const clientId = useMemo(() => getClientId(), []);

  useEffect(() => {
    const sendTimers = sendTimersRef.current;
    const client = new ChatClient({ url: buildWsUrl(roomId, user, name, clientId) });
    clientRef.current = client;

    const offStatus = client.onStatus((status) => store.setState({ status }));
    const off = client.on((event) => {
      switch (event.type) {
        case "hello":
          store.setState((s) => ({
            selfId: event.selfId,
            selfName: event.selfName,
            // Merge (not replace) so a reconnect keeps in-flight optimistic sends.
            messages: mergeHistory(s.messages, event.history),
            members: event.members,
            hasMoreHistory: event.history.length >= HISTORY_PAGE_SIZE,
          }));
          break;
        case "message": {
          const { clientMsgId } = event.message;
          if (clientMsgId) {
            const timer = sendTimers.get(clientMsgId);
            if (timer) {
              clearTimeout(timer);
              sendTimers.delete(clientMsgId);
            }
          }
          store.setState((s) => ({ messages: reconcileEcho(s.messages, event.message) }));
          break;
        }
        case "history_page":
          store.setState((s) => ({
            messages: prependPage(s.messages, event.messages),
            hasMoreHistory: event.hasMore,
            loadingOlder: false,
          }));
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
      for (const timer of sendTimers.values()) clearTimeout(timer);
      sendTimers.clear();
    };
  }, [roomId, user, name, clientId, store]);

  const state = useStore(store);

  const actions = useMemo(() => {
    const dispatchSend = (text: string, clientMsgId: string) => {
      clientRef.current?.send({ type: "send", text, clientMsgId });
      const timer = setTimeout(() => {
        store.setState((s) => ({ messages: markFailed(s.messages, clientMsgId) }));
        sendTimersRef.current.delete(clientMsgId);
      }, SEND_TIMEOUT_MS);
      sendTimersRef.current.set(clientMsgId, timer);
    };

    return {
      sendMessage: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const clientMsgId = crypto.randomUUID();
        const { selfId, selfName } = store.getState();
        const optimistic: Message = {
          id: clientMsgId,
          senderId: selfId ?? "me",
          senderName: selfName ?? "나",
          text: trimmed,
          ts: Date.now(),
          status: "sending",
          clientMsgId,
        };
        store.setState((s) => ({ messages: applyOptimistic(s.messages, optimistic) }));
        dispatchSend(trimmed, clientMsgId);
      },
      retry: (clientMsgId: string) => {
        const target = store.getState().messages.find((m) => m.clientMsgId === clientMsgId);
        if (!target || target.status !== "failed") return;
        store.setState((s) => ({
          messages: s.messages.map((m) =>
            m.clientMsgId === clientMsgId ? { ...m, status: "sending" } : m,
          ),
        }));
        dispatchSend(target.text, clientMsgId);
      },
      loadOlder: () => {
        const s = store.getState();
        if (s.loadingOlder || !s.hasMoreHistory) return;
        const oldest = s.messages.find((m) => m.seq !== undefined);
        store.setState({ loadingOlder: true });
        clientRef.current?.send({
          type: "history_request",
          beforeSeq: oldest?.seq,
          limit: HISTORY_PAGE_SIZE,
        });
      },
      // Rich message: image/file/system/card. The server is authoritative, so we
      // let the echo render it (no optimistic bubble needed for cards/system).
      compose: (input: {
        kind: "image" | "file" | "system" | "card";
        text?: string;
        media?: Media;
        card?: Card;
      }) =>
        clientRef.current?.send({ type: "compose", clientMsgId: crypto.randomUUID(), ...input }),
      // Tap a card button (e.g. accept an appointment) → server emits a system message.
      tapAction: (messageId: string, actionId: string) =>
        clientRef.current?.send({ type: "action", messageId, actionId }),
      setTyping: (isTyping: boolean) =>
        clientRef.current?.send({ type: "typing", isTyping }),
      markRead: (messageId: string) =>
        clientRef.current?.send({ type: "read", messageId }),
      simulateDisconnect: () =>
        clientRef.current?.simulateDisconnect({
          minReconnectDelayMs: RECONNECT_SIM_VISIBLE_MS,
        }),
    };
  }, [store]);

  return { ...state, ...actions };
}
