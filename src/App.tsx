import { useState } from "react";
import { ChatPanel } from "./react/components/ChatPanel";

export default function App() {
  const [room] = useState(
    () => new URLSearchParams(location.search).get("room") ?? "lobby",
  );

  return (
    <main className="app">
      <header className="app__hero">
        <h1 className="app__title">
          carrot<span className="app__dot">·</span>chat
        </h1>
        <p className="app__tagline">
          React + TypeScript + Cloudflare Durable Objects(WebSocket)로 만든 재사용 가능한 웹채팅 SDK 데모
        </p>
        <p className="app__hint">
          아래 두 패널은 같은 방(<code>{room}</code>)에 연결된 독립 클라이언트예요. 한쪽에서 입력하면
          다른 쪽에 실시간으로 도착하고, <b>읽음·타이핑·접속자 수</b>가 동기화됩니다. 다른 탭이나 기기에서
          열어도 같은 방으로 이어져요.
        </p>
      </header>

      <div className="app__grid">
        <ChatPanel roomId={room} user="alice" name="앨리스" accent="#FF6F0F" />
        <ChatPanel roomId={room} user="bob" name="바다" accent="#1F8CE6" />
      </div>

      <footer className="app__foot">
        <a href="https://github.com/FLY2ED" target="_blank" rel="noreferrer">
          github.com/FLY2ED
        </a>
        <span> · 박성재 · NALDA</span>
      </footer>
    </main>
  );
}
