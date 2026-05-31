import { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel, type ChatPanelApi } from "./react/components/ChatPanel";

const ROOM_KEY = "carrot-chat:room";
const NICK_ALICE_KEY = "carrot-chat:alice";
const NICK_BOB_KEY = "carrot-chat:bob";

// Mirrors the worker's `/api/room/:roomId/ws` route. Anything outside this
// shape would 404 forever and trap the client in a reconnect loop, so we
// sanitize on the way in and fall back to a fresh room.
const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;

function sanitizeRoom(value: string | null): string | null {
  if (!value) return null;
  return ROOM_RE.test(value) ? value : null;
}

function randomRoomId(): string {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

function getInitialRoom(): string {
  const param = sanitizeRoom(new URLSearchParams(location.search).get("room"));
  if (param) return param;
  const stored = sanitizeRoom(sessionStorage.getItem(ROOM_KEY));
  if (stored) return stored;
  const fresh = randomRoomId();
  sessionStorage.setItem(ROOM_KEY, fresh);
  return fresh;
}

export default function App() {
  const [room, setRoom] = useState<string>(getInitialRoom);
  const [aliceName, setAliceName] = useState<string>(
    () => sessionStorage.getItem(NICK_ALICE_KEY) ?? "앨리스",
  );
  const [bobName, setBobName] = useState<string>(
    () => sessionStorage.getItem(NICK_BOB_KEY) ?? "바다",
  );
  const [activeTab, setActiveTab] = useState<"alice" | "bob">("alice");
  const [toast, setToast] = useState<string | null>(null);

  const aliceApi = useRef<ChatPanelApi | null>(null);
  const bobApi = useRef<ChatPanelApi | null>(null);

  useEffect(() => sessionStorage.setItem(NICK_ALICE_KEY, aliceName), [aliceName]);
  useEffect(() => sessionStorage.setItem(NICK_BOB_KEY, bobName), [bobName]);

  // Reflect the active room in the URL so it can be shared and persists across reloads.
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("room", room);
    history.replaceState({}, "", url.toString());
    sessionStorage.setItem(ROOM_KEY, room);
  }, [room]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast("공유 링크가 복사됐어요");
    } catch {
      showToast("복사에 실패했어요 — 주소창에서 직접 복사해 주세요");
    }
  };

  const newRoom = () => {
    const fresh = randomRoomId();
    setRoom(fresh);
    showToast(`새 방으로 이동했어요 — ${fresh}`);
  };

  const sampleMessage = () => {
    aliceApi.current?.sendMessage("안녕하세요 👋 carrot-chat 데모입니다.");
    setTimeout(() => bobApi.current?.sendMessage("실시간으로 잘 도착하네요!"), 600);
  };

  const maskTest = () => {
    aliceApi.current?.sendMessage("내 번호 010-1234-5678 로 연락주세요 (마스킹 정책 확인)");
  };

  const reconnectSim = () => {
    aliceApi.current?.simulateDisconnect();
    showToast("앨리스 연결을 끊었어요 — 자동 재연결을 지켜보세요");
  };

  const handleAliceApi = useCallback((api: ChatPanelApi | null) => {
    aliceApi.current = api;
  }, []);
  const handleBobApi = useCallback((api: ChatPanelApi | null) => {
    bobApi.current = api;
  }, []);

  return (
    <main className="app">
      <header className="app__hero">
        <h1 className="app__title">
          carrot<span className="app__dot">·</span>chat
        </h1>
        <p className="app__tagline">
          당근 채팅팀의 <b>재사용 가능한 웹채팅 SDK</b> 미션을 작게 재현한 데모예요.
        </p>
        <p className="app__hint">
          두 패널은 같은 방에 연결된 독립 클라이언트입니다. 한쪽에서 입력하면 다른 쪽에 실시간으로 도착하고,
          읽음·타이핑·접속자 수가 동기화돼요.
        </p>
      </header>

      <div className="archstrip" aria-label="아키텍처 요약">
        <div className="arch">
          <b>chat-core</b>
          <span>프레임워크 비종속 SDK · 자동 재연결 · 하트비트 · 이벤트 모델</span>
        </div>
        <div className="arch">
          <b>React + Zustand</b>
          <span>인스턴스별 store · 접근성 <code>role=log</code>/<code>aria-live</code></span>
        </div>
        <div className="arch">
          <b>Durable Object</b>
          <span>WebSocket Hibernation · SQLite 히스토리 · 서버측 정책 제어 + rate limit</span>
        </div>
        <div className="arch">
          <b>Tested</b>
          <span>Vitest 14 · Playwright E2E 2 · typecheck/build 통과</span>
        </div>
      </div>

      <section className="controls" aria-label="데모 컨트롤">
        <div className="controls__row">
          <span className="controls__label">방</span>
          <code className="controls__code">{room}</code>
          <button type="button" className="btn btn--ghost" onClick={copyShareLink}>
            🔗 공유 링크 복사
          </button>
          <button type="button" className="btn btn--ghost" onClick={newRoom}>
            새 방
          </button>
        </div>
        <div className="controls__row controls__row--actions">
          <button type="button" className="btn" onClick={sampleMessage}>
            샘플 메시지 보내기
          </button>
          <button type="button" className="btn" onClick={maskTest}>
            연락처 마스킹 테스트
          </button>
          <button type="button" className="btn" onClick={reconnectSim}>
            재연결 시뮬레이션 (앨리스)
          </button>
        </div>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </section>

      <nav className="tabs" aria-label="패널 선택">
        <button
          type="button"
          className={`tab ${activeTab === "alice" ? "tab--active" : ""}`}
          onClick={() => setActiveTab("alice")}
        >
          {aliceName}
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "bob" ? "tab--active" : ""}`}
          onClick={() => setActiveTab("bob")}
        >
          {bobName}
        </button>
      </nav>

      <div className="app__grid">
        <div className={`pane ${activeTab === "alice" ? "pane--active" : ""}`}>
          <NamedPanel
            user="alice"
            initialName={aliceName}
            onCommitName={setAliceName}
            roomId={room}
            accent="#FF6F0F"
            onApi={handleAliceApi}
          />
        </div>
        <div className={`pane ${activeTab === "bob" ? "pane--active" : ""}`}>
          <NamedPanel
            user="bob"
            initialName={bobName}
            onCommitName={setBobName}
            roomId={room}
            accent="#1F8CE6"
            onApi={handleBobApi}
          />
        </div>
      </div>

      <footer className="app__foot">
        <a href="https://github.com/FLY2ED/carrot-chat" target="_blank" rel="noreferrer">
          github.com/FLY2ED/carrot-chat
        </a>
        <span> · 박성재 · NALDA</span>
      </footer>
    </main>
  );
}

interface NamedPanelProps {
  user: string;
  initialName: string;
  onCommitName: (n: string) => void;
  roomId: string;
  accent: string;
  onApi: (api: ChatPanelApi | null) => void;
}

function NamedPanel({
  user,
  initialName,
  onCommitName,
  roomId,
  accent,
  onApi,
}: NamedPanelProps) {
  const [draft, setDraft] = useState(initialName);

  useEffect(() => setDraft(initialName), [initialName]);

  const commit = () => {
    const next = draft.trim().slice(0, 20) || initialName;
    if (next !== initialName) onCommitName(next);
  };

  return (
    <div className="named">
      <input
        className="named__input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`${user} 닉네임 (엔터로 적용)`}
        maxLength={20}
      />
      <ChatPanel
        roomId={roomId}
        user={user}
        name={initialName}
        accent={accent}
        onApi={onApi}
      />
    </div>
  );
}
