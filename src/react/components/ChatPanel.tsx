import { useEffect, type CSSProperties } from "react";
import { useChatRoom } from "../useChatRoom";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { PresenceBar, StatusBadge, TypingIndicator } from "./Bits";

/** Imperative handle the parent can drive (sample buttons, reconnect sim). */
export interface ChatPanelApi {
  sendMessage: (text: string) => void;
  setTyping: (b: boolean) => void;
  simulateDisconnect: () => void;
}

interface Props {
  roomId: string;
  user: string;
  name: string;
  accent?: string;
  /** Receive an imperative API when this panel connects. */
  onApi?: (api: ChatPanelApi | null) => void;
}

export function ChatPanel({ roomId, user, name, accent, onApi }: Props) {
  const room = useChatRoom(roomId, user, name);

  // Mark the latest message as read whenever the conversation grows.
  const lastId = room.messages.at(-1)?.id;
  useEffect(() => {
    if (lastId) room.markRead(lastId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  // Expose imperative API to the parent for sample buttons.
  useEffect(() => {
    if (!onApi) return;
    onApi({
      sendMessage: room.sendMessage,
      setTyping: room.setTyping,
      simulateDisconnect: room.simulateDisconnect,
    });
    return () => onApi(null);
  }, [onApi, room.sendMessage, room.setTyping, room.simulateDisconnect]);

  const typingNames = Object.entries(room.typing)
    .filter(([id]) => id !== room.selfId)
    .map(([, displayName]) => displayName);

  const connectionOpen = room.status === "open";

  return (
    <section
      className="panel"
      style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}
      aria-label={`${name} 채팅 패널`}
    >
      <header className="panel__head">
        <span className="panel__who">{name}</span>
        <span className="panel__meta">
          <PresenceBar members={room.members} />
          <StatusBadge status={room.status} />
        </span>
      </header>
      <MessageList
        messages={room.messages}
        selfId={room.selfId}
        reads={room.reads}
        onRetry={room.retry}
      />
      <TypingIndicator names={typingNames} />
      {room.notice && (
        <div className="notice" role="status" aria-live="polite">
          {room.notice}
        </div>
      )}
      <Composer
        onSend={room.sendMessage}
        onTyping={room.setTyping}
        disabled={!connectionOpen}
      />
    </section>
  );
}
