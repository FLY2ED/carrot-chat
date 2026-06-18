import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Message } from "../../chat-core/types";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  messages: Message[];
  selfId: string | null;
  reads: Record<string, string>;
  onRetry?: (clientMsgId: string) => void;
  onLoadOlder?: () => void;
  hasMoreHistory?: boolean;
  loadingOlder?: boolean;
}

export function MessageList({
  messages,
  selfId,
  reads,
  onRetry,
  onLoadOlder,
  hasMoreHistory,
  loadingOlder,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  // Only auto-scroll to new messages when the user is already at the bottom.
  const stickToBottom = useRef(true);
  const prevLen = useRef(messages.length);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
    getItemKey: (i) => messages[i]?.clientMsgId ?? messages[i]?.id ?? i,
  });

  // "읽음" watermark: latest ts anyone OTHER than me has read up to.
  const tsById = new Map(messages.map((m) => [m.id, m.ts]));
  let readWatermark = 0;
  for (const [readerId, messageId] of Object.entries(reads)) {
    if (readerId === selfId) continue;
    readWatermark = Math.max(readWatermark, tsById.get(messageId) ?? 0);
  }

  useEffect(() => {
    if (messages.length > prevLen.current && stickToBottom.current) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
    prevLen.current = messages.length;
  }, [messages.length, virtualizer]);

  const handleScroll = () => {
    const el = parentRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 48 && hasMoreHistory && !loadingOlder) onLoadOlder?.();
  };

  return (
    <div
      className="messages"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="대화 내용"
      ref={parentRef}
      onScroll={handleScroll}
    >
      {loadingOlder && <div className="messages__loading">이전 메시지 불러오는 중…</div>}
      <div className="messages__virtual" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const m = messages[vi.index];
          if (!m) return null;
          const mine = m.senderId === selfId;
          const read = mine && !m.status && m.ts <= readWatermark;
          const stateClass =
            m.status === "sending" ? " msg--sending" : m.status === "failed" ? " msg--failed" : "";
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className={`msg-row${mine ? " msg-row--mine" : ""}`}
              style={{ transform: `translateY(${vi.start}px)` }}
            >
              <div className={`msg ${mine ? "msg--mine" : "msg--theirs"}${stateClass}`}>
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
                  {mine && !m.status && (
                    <span className="msg__read">{read ? "읽음" : "전송됨"}</span>
                  )}
                  <time dateTime={new Date(m.ts).toISOString()}>{formatTime(m.ts)}</time>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
