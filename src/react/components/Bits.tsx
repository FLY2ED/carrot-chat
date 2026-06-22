import type { ConnectionStatus, Member } from "@naldadev/chat";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "연결 중…",
  open: "실시간 연결됨",
  reconnecting: "재연결 중…",
  closed: "연결 끊김",
};

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`status status--${status}`} role="status" aria-live="polite">
      <span className="status__dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PresenceBar({ members }: { members: Member[] }) {
  return (
    <span className="presence" aria-label={`접속자 ${members.length}명`}>
      <span aria-hidden="true">👥</span> {members.length}
    </span>
  );
}

export function TypingIndicator({ names }: { names: string[] }) {
  const text = names.length > 0 ? `${names.join(", ")}님이 입력 중…` : "";
  return (
    <div className="typing" aria-live="polite">
      {text || " "}
    </div>
  );
}
