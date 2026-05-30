# carrot-chat

당근 채팅팀이 만드는 **"재사용 가능한 웹채팅 SDK"** 미션을 작게 재현한 데모입니다.
React + TypeScript 프론트엔드와 Cloudflare **Durable Objects(WebSocket)** 백엔드로,
실시간 1:1/그룹 채팅의 핵심(메시지·읽음·타이핑·접속·재연결)을 헤드리스 SDK로 분리해 구현했습니다.

**라이브:** https://carrot.naldadev.com · **만든 사람:** 박성재 (NALDA)

---

## 지원서에서 보여주려는 것

이 프로젝트는 채팅 앱 UI 자체보다, 당근 채팅팀 공고에서 요구하는 다음 역량을 증명하는 데 초점을 두었습니다.

- **웹채팅 SDK 경계 설계** — WebSocket 연결/재연결/하트비트/이벤트 팬아웃을 React 밖의 `chat-core`로 분리
- **확장 가능한 이벤트 모델** — 클라이언트와 서버가 같은 TypeScript discriminated union을 공유
- **운영 정책 제어** — 연락처/이메일 마스킹을 클라이언트가 아니라 Durable Object 서버에서 강제
- **상태관리 경험** — React 바인딩은 인스턴스별 Zustand store로 SDK 상태를 렌더링
- **테스트 전략** — 순수 함수, SDK 상태머신, 컴포넌트, 실제 WebSocket E2E를 분리해 검증
- **접근성 기본기** — 대화 로그 `aria-live`, 입력 라벨, 연결 상태 `role="status"` 적용

제출용 보조 문서는 `docs/`에 정리했습니다.

- [`docs/daangn-chat-research.md`](docs/daangn-chat-research.md): 채용공고/팀 블로그 리서치 요약
- [`docs/evidence-map.md`](docs/evidence-map.md): 공고 요구사항과 코드/프로젝트 근거 매핑
- [`docs/application-draft.md`](docs/application-draft.md): 지원서 답변 초안
- [`docs/resume-bullets.md`](docs/resume-bullets.md): 이력서/포트폴리오용 짧은 bullet
- [`docs/submission-checklist.md`](docs/submission-checklist.md): 제출 전 체크리스트

---

## 왜 이렇게 설계했나

채팅팀의 실제 일("표준 컴포넌트 · 이벤트 모델 · API 어댑터를 갖춘 재사용 가능한 채팅 SDK")을
의식해, UI와 통신 로직을 분리했습니다.

```
src/chat-core/   ← 프레임워크 비종속 헤드리스 SDK (이 폴더만 떼어내 어디서든 재사용 가능)
  types.ts        타입 안전 이벤트 모델 (client ↔ server 공용, 워커도 같은 타입을 import)
  protocol.ts     연락처/금칙어 마스킹 정책 (순수 함수)
  reconnect.ts    지수 백오프 + 지터 (순수 함수 → 단위 테스트 용이)
  client.ts       WebSocket 연결·자동 재연결·하트비트·이벤트 팬아웃

src/react/       ← React 바인딩 (위 SDK를 소비)
  store.ts        Zustand 스토어 (인스턴스별)
  useChatRoom.ts  ChatClient ↔ store 연결 훅
  components/     MessageList · Composer · TypingIndicator · 상태/접속 배지

worker/          ← Cloudflare Worker + Durable Object 백엔드
  index.ts        /api/room/:id/ws 를 방(room)별 DO로 라우팅, 그 외엔 정적 자산
  chat-room.ts    방의 단일 진실 공급원: WebSocket Hibernation + SQLite 히스토리
```

## 핵심 기능

- **실시간 메시징** — Durable Object가 방별 연결을 들고 `getWebSockets()`로 브로드캐스트
- **읽음 확인 · 타이핑 인디케이터 · 접속자 수(presence)**
- **자동 재연결** — 지수 백오프 + 지터, 의도적 종료와 비정상 종료 구분
- **하트비트** — `setWebSocketAutoResponse(ping/pong)`로 DO를 깨우지 않고 연결 유지
- **정책 제어** — 전화/이메일 등 연락처를 **서버측에서** 자동 마스킹(외부 거래 차단)
- **접근성** — 대화 로그 `role="log"` + `aria-live`, 라벨링된 입력/버튼
- **하이버네이션** — 유휴 방은 메모리에서 내려가도 SQLite 히스토리로 복구

## 기술 스택

| 영역 | 사용 |
|---|---|
| 프론트 | React 19, TypeScript, **Zustand**, Vite 7 |
| 통합 | `@cloudflare/vite-plugin` (Vite dev 안에서 실제 workerd 런타임 구동) |
| 백엔드 | Cloudflare **Workers + Durable Objects (WebSocket Hibernation)**, 내장 **SQLite** |
| 테스트 | Vitest + Testing Library (단위/컴포넌트), **Playwright** (E2E) |

> Durable Objects는 **SQLite 백엔드(`new_sqlite_classes`)** 라 Workers **무료 플랜**에서 동작합니다.

## 테스트 전략

통신 로직을 순수 함수/주입 가능한 형태로 설계해, 빠른 단위 테스트와 실제 환경 E2E를 분리했습니다.

- **단위 (Vitest)** — 재연결 백오프, 연락처 마스킹, `ChatClient` 상태머신(연결·재연결·하트비트·의도적 종료)을 가짜 WebSocket + 가짜 타이머로 검증
- **컴포넌트 (Testing Library)** — `Composer`의 타이핑 신호/전송/초기화
- **E2E (Playwright)** — 같은 방의 두 클라이언트가 실제 Durable Object를 통해 **실시간 동기화·읽음 표시**되는지, 연락처가 **서버측에서 마스킹**되는지

```bash
npm run dev        # 로컬 개발 (Vite + Worker + DO, workerd 런타임)
npm test           # Vitest 단위/컴포넌트
npm run test:e2e   # Playwright E2E (dev 서버 자동 기동)
npm run typecheck  # tsc --noEmit
npm run build      # 프로덕션 빌드 (dist/client + worker)
npm run deploy     # Cloudflare 배포 (wrangler)
```

검증 기록(2026-05-28):

- `npm run typecheck` 통과
- `npm test` 통과: 4 files, 14 tests
- `npm run build` 통과
- `npm run test:e2e` 통과: Chromium 2 tests

## 의도적으로 단순하게 둔 부분

- 인증은 데모용으로 쿼리스트링 사용자 식별(`?user=&name=`). 실제 서비스라면 JWT 핸드셰이크로 교체.
- 메시지 가상화/무한 스크롤은 범위 밖(최근 100개 로드). 메시지 폭증 시 윈도잉 추가 지점.
