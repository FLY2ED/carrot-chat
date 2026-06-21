import { useEffect, useRef, useState, type FormEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  onTyping: (isTyping: boolean) => void;
  /** Upload + send a file (image/file) attachment. */
  onAttach?: (file: File) => Promise<void>;
  /** Disable input/submit (e.g. while reconnecting). */
  disabled?: boolean;
}

export function Composer({ onSend, onTyping, onAttach, disabled = false }: Props) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const typingRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const pickFile = async (file: File | undefined) => {
    if (!file || !onAttach) return;
    setUploading(true);
    try {
      await onAttach(file);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <form className={`composer ${disabled ? "composer--disabled" : ""}`} onSubmit={submit}>
      {onAttach && (
        <>
          <input
            ref={fileRef}
            type="file"
            className="composer__file"
            onChange={(e) => pickFile(e.target.files?.[0])}
            hidden
            aria-hidden="true"
            tabIndex={-1}
          />
          <button
            type="button"
            className="composer__attach"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            aria-label="파일 첨부"
            title="이미지·파일 첨부 (최대 5MB)"
          >
            {uploading ? "…" : "📎"}
          </button>
        </>
      )}
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
