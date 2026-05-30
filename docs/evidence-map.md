# Evidence Map For Application

당근 채팅팀 인턴 공고의 평가 포인트와 제출 자료의 근거를 연결한 문서입니다.

## 1. 공고 요구사항과 carrot-chat 매핑

| 공고 요구/업무 | 제출 근거 | 파일 |
|---|---|---|
| TypeScript와 React로 제품을 만들어 본 경험 | React 19 + TypeScript 기반 웹채팅 데모 | `src/App.tsx`, `src/react/components/*` |
| 상태관리 라이브러리 경험 | 인스턴스별 Zustand vanilla store | `src/react/store.ts`, `src/react/useChatRoom.ts` |
| 테스트 전략과 테스트 코드 | 순수 함수, SDK 상태머신, 컴포넌트, 실제 WebSocket E2E로 분리 | `src/chat-core/*.test.ts`, `src/react/components/Composer.test.tsx`, `e2e/chat.spec.ts` |
| 기존 코드베이스를 읽고 일관된 스타일로 개선 | SDK, React 바인딩, Worker 계층을 분리해 역할별 파일 구조 유지 | `src/chat-core`, `src/react`, `worker` |
| WebSocket/HTTP 이해 | WebSocket 연결·자동 재연결·하트비트·DO 브로드캐스트. 더불어 artdata 실서비스에서 Socket.io 기반 실시간 1:1 채팅(읽음/타이핑/파일/마스킹)을 원작자로 구현 | `src/chat-core/client.ts`, `worker/chat-room.ts`, artdata (Socket.io) |
| 확장 가능한 메시지 구조 | 클라이언트/서버 공용 이벤트 모델을 discriminated union으로 정의 | `src/chat-core/types.ts` |
| SDK 안전 배포를 위한 테스트 인프라 | Vitest + Testing Library + Playwright E2E | `package.json`, `vitest.config.ts`, `playwright.config.ts` |
| 운영 페이지/정책 제어 감각 | 서버측 연락처 마스킹 정책, 읽음/타이핑/presence 상태 가시화 | `src/chat-core/protocol.ts`, `worker/chat-room.ts`, `src/react/components/*` |
| 접근성 관심 | 로그 영역 `aria-live`, 입력 라벨, 상태 배지 `role=status` | `src/react/components/MessageList.tsx`, `src/react/components/Bits.tsx`, `src/react/components/Composer.tsx` |
| 새로운 기술 적응력 | Cloudflare Workers + Durable Objects + WebSocket Hibernation + SQLite | `worker/chat-room.ts`, `wrangler.jsonc` |

## 2. carrot-chat 핵심 설명

한 문장:

> 당근 채팅팀의 "재사용 가능한 웹채팅 SDK, 웹채팅 경험 고도화, 운영 정책 제어" 과제를 작게 재현하기 위해 React UI와 WebSocket 통신 로직을 분리하고, Cloudflare Durable Objects 기반 실시간 채팅을 구현했습니다.

조금 긴 설명:

> 채팅 UI만 만드는 대신 프레임워크 비종속 `chat-core`를 먼저 만들었습니다. 이 레이어는 WebSocket 연결, 자동 재연결, 하트비트, 서버 이벤트 팬아웃을 담당하고, React는 Zustand store와 컴포넌트를 통해 상태를 렌더링하는 얇은 바인딩으로 두었습니다. 서버는 Durable Object가 방 단위 단일 진실 공급원 역할을 하며, 메시지 히스토리 저장, presence, typing, read receipt, 연락처 마스킹 정책을 처리합니다. 테스트는 순수 함수/SDK 상태머신/컴포넌트/E2E로 나누어 빠른 피드백과 실제 런타임 검증을 분리했습니다.

검증 결과:

- `npm run typecheck`: 통과
- `npm test`: 4 files, 14 tests 통과
- `npm run build`: 통과
- `npm run test:e2e`: Chromium 2 tests 통과

## 3. 보조 프로젝트 근거

아래 프로젝트들은 메인 포트폴리오가 아니라 "실제로 제품을 운영하고, 문서화하고, 검증해 본 사람"이라는 보조 근거로 사용합니다.

### artdata

경로: `/Users/fly2e/Documents/artdata`

- Vue 3/Vite 프론트엔드, Express/Prisma 백엔드, AI 분석 모듈을 포함한 복합 서비스.
- Pinia, Socket.IO, Chart.js, Sentry, rich text editor, PDF/이미지 처리 등 운영형 제품 요소가 많음.
- Jest/Vitest/Playwright 관련 테스트와 QA 문서가 풍부함.
- 지원서에서는 "정책과 계산 로직이 많은 서비스에서 문서 기반으로 요구사항을 분해하고, QA 문서와 테스트를 통해 검증했다"는 근거로 사용.
- React 포지션의 직접 근거로 과대 포장하지 말고, "복잡한 운영 서비스 경험"으로 사용.

### Monggeul wedding invitation app

경로: `/Volumes/p44/Documents/wedding`

- Vue 3/Vite/Pinia 프론트와 Hono 기반 Cloudflare Worker API, Neon + Drizzle ORM 구조.
- 공개 서비스/운영 배포/인증/API/CORS/DB를 함께 다룬 경험.
- 지원서에서는 "프론트만이 아니라 백엔드/API/배포 환경까지 읽고 문제를 끝까지 닫은 경험"으로 사용.

### Dangaro

경로: `/Volumes/p44/Documents/dangaro`

- Nuxt 3 + TypeScript + Cloudflare Pages + Neon/Drizzle + Upstash rate limit + 결제/인증/SEO.
- Vitest와 Playwright 기반 QA 시나리오가 있음.
- 지원서에서는 "사용자 플로우와 운영 리스크를 검증 체크리스트로 관리한 경험"으로 사용.

### KORI VOCA

경로: App Store 출시 · 팀 '피피' · ST창업오디션 최우수상 (2025)

- React Native + TypeScript 한국어 학습 앱. SM-2 간격 반복, 접근성(고대비·스크린리더·reduced motion) 적용.
- 지원서에서는 "팀 협업으로 React Native 제품을 App Store까지 출시·수상한 경험"으로 사용.

### Desktop Dday

경로: 외부 매각 · GitHub 비공개 (포트폴리오 활용 허용)

- Electron + Vue 3로 1인 개발한 바탕화면 D-Day 위젯. Microsoft·Google·Apple 3개 스토어 출시.
- AWS Amplify(Cognito + AppSync + DataStore) 기기간 동기화 + Google/Apple OAuth, 투명·클릭통과 위젯 등 네이티브 통합 직접 구현.
- Disquiet 위클리 프로덕트 선정, 운영 후 매각(Exit).
- 지원서에서는 "작은 제품을 끝까지 만들어 출시·운영·종료까지 책임진 오너십 경험"으로 사용.

### landing-security / chickenplace 계열

경로: `/Users/fly2e/Documents/landing-security`, `/Users/fly2e/Documents/chickenplace`

- 랜딩페이지 어드민 보안 공통 모듈.
- AES-256-CBC 암호화, 개인정보 마스킹, 접속 로그, IP 접근 제한, 조회/다운로드 증적.
- 지원서에서는 `carrot-chat`의 서버측 연락처 마스킹과 연결해 "운영 정책은 클라이언트 UI가 아니라 서버에서 강제해야 한다"는 관점을 보조하는 근거로 사용.

## 4. 제출 자료 우선순위

1. `carrot-chat` 라이브 URL
2. `carrot-chat` GitHub 저장소 또는 코드 압축/포트폴리오 페이지
3. `README.md`
4. `docs/application-draft.md`
5. 보조 프로젝트 링크: NALDA 포트폴리오, Monggeul, Dangaro 등 공개 가능한 것만

## 5. 면접에서 예상 질문과 답변 방향

### 왜 Durable Objects를 썼나요?

방 단위로 상태를 모아야 하는 채팅 문제와 잘 맞기 때문입니다. 한 방의 연결, presence, 최근 메시지 히스토리를 Durable Object 하나가 관리하면 브로드캐스트 경로가 단순해집니다. 이 데모에서는 운영 규모보다 구조적 적합성과 테스트 가능한 SDK 경계를 보여주는 데 목적을 두었습니다.

### SDK라고 부르려면 무엇이 더 필요할까요?

패키징, public API 안정화, 버전 정책, 샘플 앱, 문서, 브레이킹 체인지 관리가 더 필요합니다. 현재는 SDK로 확장하기 위한 core/react 분리를 보여주는 단계이고, 실제 배포 단계에서는 이벤트 모델과 어댑터 계층을 더 엄격히 관리해야 합니다.

### 테스트 전략을 왜 이렇게 나눴나요?

재연결 백오프나 연락처 마스킹은 순수 함수로 빠르게 검증하고, WebSocket 상태머신은 가짜 WebSocket과 fake timer로 검증했습니다. UI 입력은 Testing Library로 검증하고, 실제 Durable Object 런타임과 브라우저 동기화는 Playwright E2E로 검증했습니다. 속도가 빠른 테스트와 실제 런타임 테스트를 분리해 피드백 속도와 신뢰도를 같이 가져가려는 의도입니다.

### 당근 채팅팀에서 어떤 일을 잘할 수 있나요?

작은 범위부터 SDK 경계, 이벤트 모델, 테스트 인프라, 운영 정책을 함께 생각하며 구현할 수 있습니다. 인턴으로는 먼저 기존 코드베이스의 스타일과 의사결정 맥락을 빠르게 읽고, 테스트 가능한 작은 단위로 개선을 쌓는 방식으로 기여하겠습니다.

