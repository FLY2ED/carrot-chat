import { useEffect, useRef, useState, type FormEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  onTyping: (isTyping: boolean) => void;
  /** Disable input/submit (e.g. while reconnecting). */
  disabled?: boolean;
}

export function Composer({ onSend, onTyping, disabled = false }: Props) {
  const [text, setText] = useState("");
  const typingRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTyping = (next: boolean) => {
    if (typingRef.current !== next) {
      typingRef.current = next;
      onTyping(next);
    }
  };

  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  // When the connection drops mid-typing, stop emitting typing events.
  useEffect(() => {
    if (disabled) setTyping(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const handleChange = (value: string) => {
    setText(value);
    setTyping(value.length > 0);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setTyping(false), 1500);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    setTyping(false);
  };

  return (
    <form className={`composer ${disabled ? "composer--disabled" : ""}`} onSubmit={submit}>
      <input
        className="composer__input"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={disabled ? "연결 끊김 — 자동 재연결 중" : "메시지를 입력하세요"}
        aria-label="메시지 입력"
        autoComplete="off"
        disabled={disabled}
      />
      <button
        className="composer__send"
        type="submit"
        disabled={disabled || !text.trim()}
      >
        보내기
      </button>
    </form>
  );
}
