import { useEffect, useRef } from "react";
import type { Message } from "../../chat-core/types";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  messages: Message[];
  selfId: string | null;
  reads: Record<string, string>;
}

export function MessageList({ messages, selfId, reads }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // "읽음" watermark: the latest ts that anyone OTHER than me has read up to.
  const tsById = new Map(messages.map((m) => [m.id, m.ts]));
  let readWatermark = 0;
  for (const [readerId, messageId] of Object.entries(reads)) {
    if (readerId === selfId) continue;
    readWatermark = Math.max(readWatermark, tsById.get(messageId) ?? 0);
  }

  return (
    <div
      className="messages"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="대화 내용"
    >
      {messages.map((m) => {
        const mine = m.senderId === selfId;
        const read = mine && m.ts <= readWatermark;
        return (
          <div key={m.id} className={`msg ${mine ? "msg--mine" : "msg--theirs"}`}>
            {!mine && <span className="msg__name">{m.senderName}</span>}
            <div className="msg__bubble">{m.text}</div>
            <span className="msg__meta">
              {mine && <span className="msg__read">{read ? "읽음" : "전송됨"}</span>}
              <time dateTime={new Date(m.ts).toISOString()}>{formatTime(m.ts)}</time>
            </span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
