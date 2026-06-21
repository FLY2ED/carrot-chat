import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Message } from "../../chat-core";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  messages: Message[];
  selfId: string | null;
  reads: Record<string, string>;
  onRetry?: (clientMsgId: string) => void;
  onAction?: (messageId: string, actionId: string) => void;
  onLoadOlder?: () => void;
  hasMoreHistory?: boolean;
  loadingOlder?: boolean;
}

/** Renders the inner content of one message bubble by `kind`. */
function BubbleBody({
  m,
  onAction,
}: {
  m: Message;
  onAction?: (messageId: string, actionId: string) => void;
}) {
  switch (m.kind) {
    case "image":
      return m.media ? (
        <a className="msg__media" href={m.media.url} target="_blank" rel="noreferrer">
          <img src={m.media.url} alt={m.media.name ?? "이미지"} loading="lazy" />
        </a>
      ) : (
        <div className="msg__bubble">{m.text}</div>
      );
    case "file":
      return m.media ? (
        <a className="msg__file" href={m.media.url} target="_blank" rel="noreferrer" download>
          <span className="msg__file-icon" aria-hidden>
            📎
          </span>
          <span className="msg__file-meta">
            <span className="msg__file-name">{m.media.name ?? "첨부파일"}</span>
            <span className="msg__file-size">{formatSize(m.media.size)}</span>
          </span>
        </a>
      ) : (
        <div className="msg__bubble">{m.text}</div>
      );
    case "card":
      return m.card ? (
        <div className="msg-card">
          <div className="msg-card__title">{m.card.title}</div>
          {m.card.body && <div className="msg-card__body">{m.card.body}</div>}
          {m.card.actions && m.card.actions.length > 0 && (
            <div className="msg-card__actions">
              {m.card.actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`msg-card__btn${a.style === "primary" ? " msg-card__btn--primary" : ""}`}
                  onClick={() => onAction?.(m.id, a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="msg__bubble">{m.text}</div>
      );
    default:
      return <div className="msg__bubble">{m.text}</div>;
  }
}

export function MessageList({
  messages,
  selfId,
  reads,
  onRetry,
  onAction,
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

          // System messages render centered, full-width — not as a sender bubble.
          if (m.kind === "system") {
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="msg-row msg-row--system"
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                <div className="msg-system">{m.text}</div>
              </div>
            );
          }

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
                <BubbleBody m={m} onAction={onAction} />
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
