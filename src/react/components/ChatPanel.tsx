import { useEffect, type CSSProperties } from "react";
import { useChatRoom } from "../useChatRoom";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { PresenceBar, StatusBadge, TypingIndicator } from "./Bits";

interface Props {
  roomId: string;
  user: string;
  name: string;
  accent?: string;
}

export function ChatPanel({ roomId, user, name, accent }: Props) {
  const room = useChatRoom(roomId, user, name);

  // Mark the latest message as read whenever the conversation grows.
  const lastId = room.messages.at(-1)?.id;
  useEffect(() => {
    if (lastId) room.markRead(lastId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  const typingNames = Object.entries(room.typing)
    .filter(([id]) => id !== room.selfId)
    .map(([, displayName]) => displayName);

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
      <MessageList messages={room.messages} selfId={room.selfId} reads={room.reads} />
      <TypingIndicator names={typingNames} />
      <Composer onSend={room.sendMessage} onTyping={room.setTyping} />
    </section>
  );
}
