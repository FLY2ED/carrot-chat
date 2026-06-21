import { useState } from "react";
import { SiteHeader } from "../shared/SiteHeader";

const SECTIONS = [
  { id: "intro", title: "소개" },
  { id: "install", title: "설치" },
  { id: "quickstart", title: "Quickstart" },
  { id: "react", title: "React" },
  { id: "messages", title: "리치 메시지" },
  { id: "media", title: "파일 · 이미지" },
  { id: "api", title: "Public API" },
  { id: "transport", title: "Custom Transport" },
  { id: "policy", title: "정책 · 검증" },
  { id: "auth", title: "인증" },
  { id: "assistant", title: "AI 어시스턴트" },
  { id: "links", title: "링크" },
] as const;

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="code">
      <button type="button" className="code__copy" onClick={copy} aria-label="코드 복사">
        {copied ? "복사됨 ✓" : "복사"}
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DocsApp() {
  return (
    <>
      <SiteHeader current="docs" />
      <div className="docs">
      <aside className="docs__nav" aria-label="문서 목차">
        <a className="docs__brand" href="#intro">
          🥕 <b>@naldadev/chat</b>
        </a>
        <nav>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.title}
            </a>
          ))}
        </nav>
        <a className="docs__demo" href="/">
          ← 라이브 데모로
        </a>
      </aside>

      <main className="docs__body">
        <header className="docs__hero">
          <h1>@naldadev/chat</h1>
          <p className="docs__lead">
            재사용 가능한 <b>웹채팅 SDK</b>. WebSocket 연결·자동 재연결(지수 백오프+지터)·하트비트·
            <b>Zod 런타임 검증</b>·<b>서버측 연락처 마스킹</b>을 프레임워크 비종속 코어로 묶었습니다.
            React·바닐라·SSR 어디서든 같은 코어를 씁니다.
          </p>
          <div className="docs__badges">
            <span className="badge">React 19 · TypeScript</span>
            <span className="badge">Cloudflare Durable Objects · R2</span>
            <span className="badge">Vitest 35 · Playwright 13</span>
          </div>
        </header>

        <section id="intro">
          <h2>소개</h2>
          <p>
            <code>@naldadev/chat</code>는 채팅 <em>UI</em>가 아니라 채팅의{" "}
            <b>연결·이벤트·정책 레이어</b>를 제공합니다. 연결의 수명주기(연결·재연결·하트비트·종료),
            클라이언트↔서버가 공유하는 타입 안전한 이벤트 모델, 그리고 신뢰할 수 없는 입력을 막는
            런타임 검증을 담당합니다. UI 프레임워크는 이 코어를 <em>소비</em>할 뿐입니다.
          </p>
          <ul className="docs__points">
            <li>
              <b>프레임워크 비종속</b> — <code>ChatClient</code>는 React·DOM에 의존하지 않습니다.
            </li>
            <li>
              <b>Transport 추상화</b> — 기본은 WebSocket, 필요하면 SSE·롱폴링으로 교체.
            </li>
            <li>
              <b>타입 = 런타임</b> — 같은 Zod 스키마를 클라이언트와 서버가 공유합니다.
            </li>
            <li>
              <b>정책은 서버에서</b> — 연락처 마스킹·rate limit은 우회 불가능한 서버측에서 강제.
            </li>
          </ul>
        </section>

        <section id="install">
          <h2>설치</h2>
          <CodeBlock code={`npm install @naldadev/chat zod`} />
          <p className="docs__note">
            <code>zod</code>는 peer dependency입니다 — 코어·바인딩·서버가 같은 Zod 인스턴스를 공유해야
            <code>discriminatedUnion</code> 파싱이 안전합니다.
          </p>
        </section>

        <section id="quickstart">
          <h2>Quickstart (바닐라)</h2>
          <p>
            연결을 만들고, 상태와 이벤트를 구독하고, 메시지를 보냅니다. <code>clientMsgId</code>를 붙이면
            낙관적 전송 버블을 서버 echo와 매칭해 교체할 수 있습니다.
          </p>
          <CodeBlock
            code={`import { ChatClient } from "@naldadev/chat";

const client = new ChatClient({
  url: "wss://carrot.naldadev.com/api/room/lobby/ws?user=me&name=나",
});

client.onStatus((status) => {
  // connecting → open → reconnecting → closed
  console.log("status:", status);
});

const off = client.on((event) => {
  if (event.type === "message") {
    console.log(event.message.senderName, event.message.text);
  }
});

client.connect();
client.send({ type: "send", text: "안녕하세요", clientMsgId: crypto.randomUUID() });

// 정리
off();
client.close();`}
          />
        </section>

        <section id="react">
          <h2>React</h2>
          <p>
            저장소의 <code>useChatRoom</code> 훅이 <code>ChatClient</code>를 인스턴스별 Zustand 스토어에
            바인딩합니다. 낙관적 전송·재연결 안전 머지·무한 스크롤이 모두 들어 있습니다.
          </p>
          <CodeBlock
            code={`function Chat() {
  const room = useChatRoom("lobby", "alice", "앨리스");

  return (
    <>
      {room.messages.map((m) => (
        <div key={m.clientMsgId ?? m.id}>
          {m.senderName}: {m.text}
          {m.status === "sending" && " (전송 중…)"}
          {m.status === "failed" && (
            <button onClick={() => room.retry(m.clientMsgId!)}>재시도</button>
          )}
        </div>
      ))}
      <button onClick={() => room.sendMessage("hi")}>보내기</button>
    </>
  );
}`}
          />
        </section>

        <section id="messages">
          <h2>리치 메시지 (확장형 구조)</h2>
          <p>
            모든 메시지는 <code>kind</code>로 구분됩니다 — <code>text</code>(기본)·<code>image</code>·
            <code>file</code>·<code>system</code>·<code>card</code>. 카드는 제목·본문·인라인 액션
            버튼을 담고, 버튼을 누르면 <code>action</code> 이벤트가 서버로 가 시스템 메시지로
            broadcast됩니다. 이 구조 하나로 약속 잡기·거래 상태·안전결제·안심번호 같은 도메인 기능을
            코어 수정 없이 얹습니다.
          </p>
          <CodeBlock
            code={`// 카드 메시지 — 예: 약속 제안
room.compose({
  kind: "card",
  card: {
    title: "📅 약속 잡기",
    body: "내일 오후 3시, 강남역 11번 출구 어떠세요?",
    actions: [
      { id: "accept", label: "수락", style: "primary" },
      { id: "suggest", label: "다른 시간 제안" },
    ],
  },
});

// 카드 버튼 탭 → 서버가 시스템 메시지로 broadcast
//   "OO님이 \\"수락\\"을(를) 선택했어요"
room.tapAction(messageId, "accept");`}
          />
          <p className="docs__note">
            카드 본문도 서버측 마스킹을 거칩니다. 전화·안전거래·약속 같은 <b>당근 도메인 기능은
            코어가 아니라 이 구조 위의 데모/플러그인</b>으로 구현돼, SDK 자체는 당근 종속성을 갖지
            않습니다.
          </p>
        </section>

        <section id="media">
          <h2>파일 · 이미지 (Cloudflare R2)</h2>
          <p>
            첨부는 raw-body로 업로드 엔드포인트에 보내고(<code>content-type</code>=파일 mime), 서버가
            R2에 저장한 뒤 절대 URL이 담긴 <code>media</code> 디스크립터를 돌려줍니다. 그걸로{" "}
            <code>image</code>/<code>file</code> 메시지를 compose합니다.
          </p>
          <CodeBlock
            code={`// useChatRoom이 업로드 + compose를 한 번에
await room.attach(file); // 5MB 상한 · mime 화이트리스트 · R2 저장

// 내부 동작:
//   POST /api/room/:id/upload   (body = file, x-filename 헤더)
//     → { url, mime, name, size }   // url은 /api/media/<key> 절대경로
//   room.compose({ kind: "image", media })`}
          />
          <p className="docs__note">
            저장 객체 키는 UUID 경로라 불변 — <code>cache-control: immutable</code>로 서빙합니다.
          </p>
        </section>

        <section id="api">
          <h2>Public API</h2>
          <p>
            <code>index.ts</code> 배럴이 SDK의 계약입니다. 내부 파일(재연결 정책 등)은 export하지 않으므로
            breaking 없이 바뀔 수 있습니다.
          </p>
          <table className="docs__table">
            <thead>
              <tr>
                <th>Export</th>
                <th>설명</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>ChatClient</code>, <code>ChatClientOptions</code>
                </td>
                <td>연결·이벤트 API (connect / on / onStatus / send / close)</td>
              </tr>
              <tr>
                <td>
                  <code>Transport</code>, <code>TransportFactory</code>,{" "}
                  <code>webSocketTransport</code>
                </td>
                <td>wire 추상화 — WebSocket 기본, SSE·롱폴링으로 교체 가능</td>
              </tr>
              <tr>
                <td>
                  <code>ClientEventSchema</code>, <code>ServerEventSchema</code>
                </td>
                <td>런타임 검증 (클라이언트·서버 공유)</td>
              </tr>
              <tr>
                <td>
                  <code>MessageSchema</code>, <code>MemberSchema</code>,{" "}
                  <code>MediaSchema</code>, <code>CardSchema</code>, <code>CardActionSchema</code>
                </td>
                <td>메시지·리치 콘텐츠(이미지·파일·카드) 검증 스키마</td>
              </tr>
              <tr>
                <td>
                  <code>maskContact</code>
                </td>
                <td>연락처/이메일 마스킹 정책 (순수 함수, 도메인 패턴 확장 가능)</td>
              </tr>
              <tr>
                <td>
                  <code>Message</code>, <code>ServerEvent</code>, <code>ClientEvent</code>,{" "}
                  <code>Member</code>, <code>ConnectionStatus</code>, <code>Media</code>,{" "}
                  <code>Card</code>
                </td>
                <td>이벤트 모델 타입</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="transport">
          <h2>Custom Transport</h2>
          <p>
            <code>ChatClient</code>는 <code>WebSocket</code>이 아니라 좁은 <code>Transport</code>{" "}
            인터페이스에 의존합니다. 다른 wire를 주입하거나(SSE 등), 테스트에서 가짜를 넣을 수 있습니다.
          </p>
          <CodeBlock
            code={`import { ChatClient, type Transport } from "@naldadev/chat";

const sseTransport = (url: string): Transport => {
  const handlers = { /* open/message/close/error 리스너 Set */ };
  let es: EventSource | null = null;
  return {
    get state() { return es ? "open" : "closed"; },
    connect() { es = new EventSource(url); /* es.onmessage → message 이벤트 */ },
    send() { /* SSE는 단방향 — 전송은 별도 HTTP POST로 */ },
    on(type, handler) { /* 등록 후 해지 함수 반환 */ return () => {}; },
    close() { es?.close(); },
  };
};

new ChatClient({ url, transport: sseTransport });`}
          />
          <p className="docs__note">
            하트비트·재연결·백오프는 <code>ChatClient</code>에 남아 있어, <code>send</code>가 없는 SSE
            transport도 이 인터페이스에 맞습니다.
          </p>
        </section>

        <section id="policy">
          <h2>정책 · 검증</h2>
          <p>
            메시지는 신뢰 경계(서버↔클라이언트)에서 항상 검증됩니다. 마스킹은 클라이언트가 우회할 수 없는
            서버측에서 강제됩니다.
          </p>
          <CodeBlock
            code={`import { maskContact, ServerEventSchema } from "@naldadev/chat";

// 서버는 저장 직전에 마스킹 — DB에도 원본이 남지 않는다
maskContact("내 번호 010-1234-5678 로 연락");
// → "내 번호 [비공개] 로 연락"

// 클라이언트는 들어오는 모든 프레임을 검증
const parsed = ServerEventSchema.safeParse(JSON.parse(raw));
if (!parsed.success) return; // 변조/손상 프레임 폐기`}
          />
        </section>

        <section id="auth">
          <h2>인증 (JWT 핸드셰이크)</h2>
          <p>
            브라우저 WebSocket은 <code>Authorization</code> 헤더를 못 붙이므로 토큰을 쿼리스트링에
            싣습니다. Worker가 <b>업그레이드를 수락하기 전에</b> HS256 서명·만료를 WebCrypto로 검증하고
            (<code>worker/auth.ts</code>), 검증된 <code>sub</code>/<code>name</code>을 신원으로
            <b>주입</b>합니다 — 클라이언트가 보낸 <code>user</code>/<code>name</code>은 무시되므로 위조
            불가. 공개 놀이터는 <code>ALLOW_ANON</code>으로 익명을 허용하고, 실배포는{" "}
            <code>ALLOW_ANON=false</code>로 토큰을 강제합니다.
          </p>
          <CodeBlock
            code={`// worker: 업그레이드 전 검증 + 신원 주입 (위조 불가)
const claims = await verifyToken(env.JWT_SECRET, token, nowSec);
if (!claims) return new Response("invalid_or_expired_token", { status: 401 });
url.searchParams.set("user", claims.sub);   // 클라가 보낸 값 덮어씀
url.searchParams.set("name", claims.name);
return chatRoom.fetch(new Request(url, request)); // 검증된 신원으로 DO 연결

// 토큰 발급(데모): 실서비스는 로그인 백엔드가 발급 — 여기선 /api/dev-token이 대역
const { token } = await fetch(\`/api/dev-token?user=\${id}&name=\${name}\`).then(r => r.json());
new ChatClient({ url: \`wss://host/api/room/\${roomId}/ws?token=\${token}\` });`}
          />
          <p className="docs__note">
            토큰 만료 대비 <b>refreshGate</b> — (재)연결마다 신선한 토큰을 제시하고, 동시 갱신을 한 번으로
            합쳐 소켓·HTTP에 새 토큰을 전파하는 패턴은 실서비스 artdata의 Socket.io 채팅에서 운영한
            방식입니다. 이 SDK에선 (재)연결 직전에 <code>getToken()</code>으로 토큰을 받아 URL에 싣는
            형태로 같은 보장을 줍니다.
          </p>
        </section>

        <section id="assistant">
          <h2>AI 어시스턴트 (tool-use)</h2>
          <p>
            채팅 코어는 그대로 두고, 서버가 <code>@ai</code>(또는 <code>@봇</code>·<code>/ai</code>)
            멘션을 가로채 LLM을 <b>tool-use</b>로 호출한 뒤 그 답을 봇 메시지로 broadcast합니다. 봇
            응답도 일반 메시지(<code>kind: text | card | system</code>)라 위의 리치 메시지 구조를 그대로
            탑니다.
          </p>
          <CodeBlock
            code={`// worker: @ai 멘션을 멀티턴 tool-use 루프로 처리
const prompt = parseAssistantTrigger(text); // "@ai 약속 잡아줘" → "약속 잡아줘"
if (prompt !== null) {
  const reply = await runAssistant(env, history, prompt);
  this.broadcast({ type: "message", message: botMessage(reply) });
}

// runAssistant 내부 (GEMINI_API_KEY 있을 때):
for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
  const parts = await generate(contents);          // Gemini generateContent
  const fc = parts.find(p => p.functionCall)?.functionCall;
  if (!fc) return text(parts);                      // 텍스트 → 최종 답
  const reply = execTool(fc.name, fc.args);
  if (TERMINAL_TOOLS.has(fc.name)) return reply;    // 카드 도구 → 즉시 종료
  contents.push(modelTurn(fc), functionResponse(fc, reply.text)); // 데이터 도구 → 회신 후 계속
}`}
          />
          <p className="docs__note">
            <b>멀티턴 도구 루프</b> — 카드를 만드는 도구는 즉시 끝내고, 데이터를 돌려주는 도구
            (요약 등)는 결과를 모델에 다시 넣어 답을 잇습니다(<code>MAX_TOOL_TURNS</code> 상한).{" "}
            <code>GEMINI_API_KEY</code>가 없으면 같은 도구 실행기를 구동하는 결정론적 키워드 스텁으로
            <b>키 없이도 데모가 완전히 동작</b>하고, 네트워크/쿼터 실패는 텍스트로 degrade돼 채팅이
            멈추지 않습니다. 실서비스 artdata의 미대 입시 챗봇이 같은 구조(14개 도구·SSE 스트리밍)입니다.
          </p>
        </section>

        <section id="links">
          <h2>링크</h2>
          <ul className="docs__links">
            <li>
              <a href="/">라이브 데모 — carrot.naldadev.com</a>
            </li>
            <li>
              <a href="/inbox.html">받은함 (멀티룸 인박스 — UserInbox DO)</a>
            </li>
            <li>
              <a href="/admin">운영 콘솔 (어드민)</a>
            </li>
            <li>
              <a
                href="https://github.com/FLY2ED/carrot-chat"
                target="_blank"
                rel="noreferrer"
              >
                GitHub — FLY2ED/carrot-chat
              </a>
            </li>
          </ul>
        </section>

        <footer className="docs__foot">
          <span>@naldadev/chat · 박성재 · NALDA</span>
        </footer>
      </main>
      </div>
    </>
  );
}
