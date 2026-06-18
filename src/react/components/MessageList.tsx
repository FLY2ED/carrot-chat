import { useEffect, useRef } from "react";
import type { Message } from "../../chat-core/types";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  messages: Message[];
  selfId: string | null;
  reads: Record<string, string>;
  onRetry?: (clientMsgId: string) => void;
}

export function MessageList({ messages, selfId, reads, onRetry }: Props) {
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
        const read = mine && !m.status && m.ts <= readWatermark;
        const stateClass =
          m.status === "sending" ? " msg--sending" : m.status === "failed" ? " msg--failed" : "";
        return (
          <div
            key={m.clientMsgId ?? m.id}
            className={`msg ${mine ? "msg--mine" : "msg--theirs"}${stateClass}`}
          >
            {!mine && <span className="msg__name">{m.senderName}</span>}
            <div className="msg__bubble">{m.text}</div>
            <span className="msg__meta">
              {m.maskApplied && (
                <span
                  className="msg__policy"
                  title="서버에서 연락처/이메일이 자동 마스킹되었습니다"
                >
                  정책 적용
                </span>
              )}
              {mine && m.status === "sending" && <span className="msg__read">전송 중…</span>}
              {mine && m.status === "failed" && (
                <button
                  type="button"
                  className="msg__retry"
                  onClick={() => m.clientMsgId && onRetry?.(m.clientMsgId)}
                >
                  전송 실패 · 재시도
                </button>
              )}
              {mine && !m.status && <span className="msg__read">{read ? "읽음" : "전송됨"}</span>}
              <time dateTime={new Date(m.ts).toISOString()}>{formatTime(m.ts)}</time>
            </span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
