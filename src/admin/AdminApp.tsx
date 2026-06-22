import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "../shared/SiteHeader";
import type { GlobalStats, RoomSummary } from "../../worker/admin-hub";
import type { Message } from "@naldadev/chat";

const TOKEN_KEY = "carrot-chat:adminToken";
const POLL_MS = 3000;
// Demo convenience: the read-only console ships with the demo token prefilled
// so visitors land straight on the dashboard. Swap to a Wrangler secret in prod.
const DEMO_TOKEN = "carrot-admin-demo";

export function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? DEMO_TOKEN);
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  const api = useCallback(
    async <T,>(path: string): Promise<T> => {
      const res = await fetch(`/api/admin/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<T>;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api<GlobalStats>("stats"),
        api<RoomSummary[]>("rooms"),
      ]);
      setStats(s);
      setRooms(r);
      setAuthed(true);
      setError(null);
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      setAuthed(false);
      setError("인증 실패 — 토큰을 확인하세요");
    }
  }, [api, token]);

  // Auto-connect on mount with the prefilled demo token → skip the login screen.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authed) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [authed, refresh]);

  useEffect(() => {
    if (!authed || !selected) return;
    api<Message[]>(`room/${selected}`)
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [authed, selected, api, rooms]);

  if (!authed) {
    return (
      <>
        <SiteHeader current="admin" />
        <main className="admin-login">
        <h1>🥕 carrot-chat 운영 콘솔</h1>
        <p>채팅 운영 모니터링 (읽기 전용). 어드민 토큰을 입력하세요.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void refresh();
          }}
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_TOKEN"
            aria-label="어드민 토큰"
            autoComplete="off"
          />
          <button type="submit">접속</button>
        </form>
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader current="admin" />
      <main className="admin">
      <header className="admin__head">
        <h1>🥕 carrot-chat 운영 콘솔</h1>
        <span className="admin__live" role="status">
          ● 실시간 ({POLL_MS / 1000}초 폴링)
        </span>
      </header>

      {stats && (
        <section className="admin__stats" aria-label="전역 통계">
          <StatCard label="활성 방" value={stats.activeRooms} sub={`전체 ${stats.rooms}`} />
          <StatCard label="총 메시지" value={stats.totalMessages} />
          <StatCard
            label="마스킹률"
            value={`${Math.round(stats.maskRate * 100)}%`}
            sub={`${stats.totalMasked}건`}
          />
          <StatCard label="Rate limit 발동" value={stats.totalRateLimited} />
          <StatCard label="재연결" value={stats.totalReconnects} />
        </section>
      )}

      <section className="admin__body">
        <table className="admin__rooms">
          <thead>
            <tr>
              <th>방</th>
              <th>상태</th>
              <th>접속</th>
              <th>메시지</th>
              <th>마스킹</th>
              <th>제한</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr
                key={r.roomId}
                onClick={() => setSelected(r.roomId)}
                className={selected === r.roomId ? "is-selected" : ""}
              >
                <td className="admin__roomid">{r.roomId}</td>
                <td>{r.active ? "🟢" : "⚪"}</td>
                <td>{r.members}</td>
                <td>{r.messageCount}</td>
                <td>{r.maskedCount}</td>
                <td>{r.rateLimitedCount}</td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={6} className="admin__empty">
                  아직 활성 방이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <aside className="admin__detail">
          {selected ? (
            <>
              <h2>{selected} — 최근 메시지</h2>
              <ul className="admin__messages" aria-live="polite">
                {messages.map((m) => (
                  <li key={m.id}>
                    <b>{m.senderName}</b> {m.text}{" "}
                    {m.maskApplied && <span className="admin__masked">정책</span>}
                  </li>
                ))}
                {messages.length === 0 && <li className="admin__empty">메시지 없음</li>}
              </ul>
            </>
          ) : (
            <p className="admin__hint">방을 선택하면 최근 메시지를 봅니다 (읽기 전용)</p>
          )}
        </aside>
      </section>
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="stat-card">
      <span className="stat-card__value">{value}</span>
      <span className="stat-card__label">{label}</span>
      {sub && <span className="stat-card__sub">{sub}</span>}
    </div>
  );
}
