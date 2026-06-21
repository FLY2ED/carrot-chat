import { useEffect, useRef, useState } from "react";
import type { InboxRoom, InboxServerEvent } from "../inbox/protocol";

const USER_KEY = "carrot-inbox:user";
const NAME_KEY = "carrot-inbox:name";

/**
 * Global notification bell in the shared header. Reads the inbox identity from
 * localStorage (set on the 받은함 page), connects to that user's UserInbox DO,
 * and shows the live unread total + a dropdown of unread rooms on EVERY page.
 * When no identity is set it degrades to a plain link to the inbox.
 */
export function NotificationBell() {
  const [identity] = useState(() => ({
    user: (localStorage.getItem(USER_KEY) ?? "").slice(0, 64),
    name: (localStorage.getItem(NAME_KEY) ?? "").slice(0, 32),
  }));
  const [rooms, setRooms] = useState<InboxRoom[]>([]);
  const [open, setOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!identity.user) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const qs = new URLSearchParams({ user: identity.user, name: identity.name || identity.user });
      const ws = new WebSocket(`${proto}//${location.host}/api/inbox/ws?${qs.toString()}`);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data as string) as InboxServerEvent;
          if (m.type === "inbox") setRooms(m.rooms);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [identity]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!identity.user) {
    return (
      <a className="site-bell" href="/inbox.html" title="받은함 — 알림 받기" aria-label="받은함">
        🔔
      </a>
    );
  }

  const totalUnread = rooms.reduce((n, r) => n + r.unread, 0);
  const unreadRooms = rooms.filter((r) => r.unread > 0);

  return (
    <div className="site-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="site-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label={`알림 ${totalUnread}건`}
        aria-expanded={open}
      >
        🔔
        {totalUnread > 0 && (
          <span className="site-bell__badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
        )}
      </button>
      {open && (
        <div className="site-bell__menu" role="menu">
          <div className="site-bell__head">{identity.name || identity.user}님의 알림</div>
          {unreadRooms.length === 0 ? (
            <div className="site-bell__empty">새 알림이 없어요</div>
          ) : (
            unreadRooms.map((r) => (
              <a
                key={r.roomId}
                className="site-bell__item"
                href={`/?room=${encodeURIComponent(r.roomId)}`}
                role="menuitem"
              >
                <span className="site-bell__room">{r.roomId}</span>
                <span className="site-bell__preview">{r.lastText}</span>
                <span className="site-bell__count">{r.unread}</span>
              </a>
            ))
          )}
          <a className="site-bell__all" href="/inbox.html">
            받은함 전체 보기 →
          </a>
        </div>
      )}
    </div>
  );
}
