import { useEffect, useRef, useState, type FormEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  onTyping: (isTyping: boolean) => void;
}

export function Composer({ onSend, onTyping }: Props) {
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

  const handleChange = (value: string) => {
    setText(value);
    setTyping(value.length > 0);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setTyping(false), 1500);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    setTyping(false);
  };

  return (
    <form className="composer" onSubmit={submit}>
      <input
        className="composer__input"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="메시지를 입력하세요"
        aria-label="메시지 입력"
        autoComplete="off"
      />
      <button className="composer__send" type="submit" disabled={!text.trim()}>
        보내기
      </button>
    </form>
  );
}
