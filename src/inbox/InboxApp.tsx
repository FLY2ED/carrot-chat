import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader } from "../shared/SiteHeader";
import type { InboxClientEvent, InboxRoom, InboxServerEvent } from "./protocol";

const USER_KEY = "carrot-inbox:user";
const NAME_KEY = "carrot-inbox:name";

// The demo's two chat identities — pick one to see its rooms light up.
const DEMO_USERS = [
  { id: "alice", name: "앨리스" },
  { id: "bob", name: "바다" },
];

function buildWsUrl(user: string, name: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const qs = new URLSearchParams({ user, name }).toString();
  return `${proto}//${location.host}/api/inbox/ws?${qs}`;
}

function formatTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function InboxApp() {
  const initial = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return {
      user: (q.get("user") ?? localStorage.getItem(USER_KEY) ?? "").slice(0, 64),
      name: (q.get("name") ?? localStorage.getItem(NAME_KEY) ?? "").slice(0, 32),
    };
  }, []);
  const [identity, setIdentity] = useState(initial);
  const [rooms, setRooms] = useState<InboxRoom[]>([]);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const prevUnreadRef = useRef(0);
  const baselineSet = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!identity.user) return;
    // localStorage (not session) so the global header bell on other tabs/pages
    // can pick up the same inbox identity.
    localStorage.setItem(USER_KEY, identity.user);
    localStorage.setItem(NAME_KEY, identity.name || identity.user);

    // New connection → re-baseline so the first snapshot doesn't toast stale unread.
    baselineSet.current = false;
    prevUnreadRef.current = 0;

    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      const ws = new WebSocket(buildWsUrl(identity.user, identity.name || identity.user));
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as InboxServerEvent;
          if (msg.type === "inbox") setRooms(msg.rooms);
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(open, 1500);
      };
      ws.onerror = () => ws.close();
    };
    open();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [identity]);

  const totalUnread = rooms.reduce((n, r) => n + r.unread, 0);

  // Notification layer: reflect unread in the tab title (visible when backgrounded)
  // and pop a toast whenever the unread total rises — a new message arrived.
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) 받은함 · carrot-chat` : "받은함 · carrot-chat";
    // First snapshot after (re)connect = baseline → don't toast pre-existing unread.
    if (!baselineSet.current) {
      baselineSet.current = true;
      prevUnreadRef.current = totalUnread;
      return;
    }
    if (totalUnread > prevUnreadRef.current) {
      const latest = rooms.reduce<InboxRoom | null>(
        (a, r) => (!a || r.lastTs > a.lastTs ? r : a),
        null,
      );
      setToast(`🔔 ${latest?.lastText || "새 메시지가 도착했어요"}`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 3500);
    }
    prevUnreadRef.current = totalUnread;
  }, [rooms, totalUnread]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const send = (data: InboxClientEvent) => wsRef.current?.send(JSON.stringify(data));

  const enter = (user: string, name: string) => {
    const u = user.trim().slice(0, 64);
    if (!u) return;
    setIdentity({ user: u, name: (name || user).trim().slice(0, 32) });
  };

  const openRoom = (roomId: string) => {
    send({ type: "read", roomId });
    location.href = `/?room=${encodeURIComponent(roomId)}`;
  };
  const toggleFav = (roomId: string) => send({ type: "favorite", roomId });

  if (!identity.user) {
    return (
      <>
        <SiteHeader current="inbox" />
        <main className="inbox">
          <section className="inbox-gate">
            <h1>받은함</h1>
            <p>
              여러 대화방의 안 읽음·미리보기를 한곳에서 봅니다. 데모를 체험하려면 두 신원 중 하나를
              고르세요 — 데모 페이지에서 상대가 메시지를 보내면 여기 실시간으로 쌓입니다.
            </p>
            <div className="inbox-gate__quick">
              {DEMO_USERS.map((u) => (
                <button key={u.id} type="button" className="btn" onClick={() => enter(u.id, u.name)}>
                  {u.name}로 입장
                </button>
              ))}
            </div>
            <form
              className="inbox-gate__form"
              onSubmit={(e) => {
                e.preventDefault();
                enter(draft, draft);
              }}
            >
              <input
                className="inbox-gate__input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="또는 사용자 ID 직접 입력"
                aria-label="사용자 ID"
                maxLength={64}
              />
              <button type="submit" className="btn btn--ghost" disabled={!draft.trim()}>
                입장
              </button>
            </form>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader current="inbox" />
      <main className="inbox">
        <header className="inbox__head">
          <div>
            <h1 className="inbox__title">받은함</h1>
            <p className="inbox__sub">
              <b>{identity.name || identity.user}</b>
              <span className={`inbox__status ${connected ? "is-on" : "is-off"}`}>
                {connected ? "실시간 연결됨" : "연결 중…"}
              </span>
              {totalUnread > 0 && <span className="inbox__total">안 읽음 {totalUnread}</span>}
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              localStorage.removeItem(USER_KEY);
              localStorage.removeItem(NAME_KEY);
              setRooms([]);
              setIdentity({ user: "", name: "" });
            }}
          >
            신원 변경
          </button>
        </header>

        {toast && (
          <div className="inbox-toast" role="status" aria-live="polite">
            {toast}
          </div>
        )}

        {rooms.length === 0 ? (
          <div className="inbox__empty">
            아직 대화가 없어요. <a href="/">데모</a>에서 같은 방에 두 사람이 들어가 메시지를 보내면
            여기 실시간으로 나타납니다.
          </div>
        ) : (
          <ul className="inbox-list">
            {rooms.map((r) => (
              <li key={r.roomId} className={`inbox-row ${r.unread > 0 ? "is-unread" : ""}`}>
                <button
                  type="button"
                  className={`inbox-row__fav ${r.favorite ? "is-on" : ""}`}
                  onClick={() => toggleFav(r.roomId)}
                  aria-label={r.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                  title={r.favorite ? "즐겨찾기 해제" : "즐겨찾기"}
                >
                  {r.favorite ? "★" : "☆"}
                </button>
                <button type="button" className="inbox-row__main" onClick={() => openRoom(r.roomId)}>
                  <span className="inbox-row__top">
                    <span className="inbox-row__name">{r.roomId}</span>
                    <time className="inbox-row__time">{formatTime(r.lastTs)}</time>
                  </span>
                  <span className="inbox-row__preview">{r.lastText || "메시지 없음"}</span>
                </button>
                {r.unread > 0 && <span className="inbox-row__badge">{r.unread}</span>}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
