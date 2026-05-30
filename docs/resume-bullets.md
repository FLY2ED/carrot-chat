# Resume Bullets

이력서/포트폴리오 페이지에 바로 옮기기 위한 짧은 문장입니다.

## 대표 프로젝트

### carrot-chat

- 당근 채팅팀의 웹 SDK/웹채팅/운영 정책 제어 과제를 작게 재현한 React + TypeScript 실시간 채팅 데모 개발
- WebSocket 연결, 자동 재연결, 하트비트, 이벤트 팬아웃을 프레임워크 비종속 `chat-core`로 분리하고 React 바인딩은 Zustand store로 구성
- Cloudflare Durable Objects(WebSocket Hibernation)와 SQLite를 이용해 방 단위 메시지 히스토리, presence, typing, read receipt 처리
- 전화번호/이메일 연락처 마스킹을 클라이언트가 아닌 서버측 정책으로 강제해 운영 정책 우회 가능성 축소
- Vitest, Testing Library, Playwright E2E로 순수 함수, SDK 상태머신, 입력 컴포넌트, 실제 WebSocket 동기화 검증
- 검증: `npm run typecheck`, `npm test`(14 tests), `npm run build`, `npm run test:e2e`(2 tests) 통과

기술 스택:

- React 19, TypeScript, Zustand, Vite
- Cloudflare Workers, Durable Objects, WebSocket Hibernation, SQLite
- Vitest, Testing Library, Playwright

링크:

- Live: https://carrot.naldadev.com
- GitHub: `TODO: 공개 저장소 URL`

## 보조 프로젝트 요약

### artdata

- 입시 분석/리포트/정책/AI 추출 로직이 결합된 운영형 서비스에서 프론트엔드, 백엔드, AI 모듈, QA 문서 흐름을 함께 다룸
- 복잡한 계산/정책 요구사항을 문서로 분해하고, QA 분석 문서와 테스트로 검증하는 방식으로 기능 안정화
- 기술 근거: Vue 3, Vite, Pinia, Express, Prisma, Socket.IO, Jest, Vitest, Playwright

### Monggeul

- 모바일 청첩장 서비스에서 Vue 3 프론트엔드와 Cloudflare Worker API, Neon/Drizzle 기반 백엔드 구조를 함께 다룸
- 인증, API 연동, 배포, CORS, 운영 체크리스트까지 포함해 프론트엔드 밖의 문제를 끝까지 추적
- 기술 근거: Vue 3, Vite, Pinia, Hono, Cloudflare Workers/Pages, Neon, Drizzle ORM

### Dangaro

- 인플루언서 광고 단가 계산 서비스에서 SSR/SEO, 인증, 결제, rate limit, QA 체크리스트를 포함한 운영형 웹 제품 개발
- 사용자 플로우와 운영 리스크를 Playwright/Vitest 기반 검증 시나리오로 관리
- 기술 근거: Nuxt 3, TypeScript, Cloudflare Pages, Neon/Drizzle, Upstash, PortOne, Vitest, Playwright

### Snow Widget

- Windows 데스크톱 위젯 앱에서 Electron/React/TypeScript 기반 UI, IPC, Win32 제약, 패키징 문제를 다룸
- 실행 환경의 제약과 재발 방지 규칙을 문서화해 이후 구현자가 같은 실수를 반복하지 않도록 정리
- 기술 근거: Electron, React, TypeScript, Vite, Tailwind, FastAPI, SQLAlchemy

### landing-security

- 랜딩페이지 어드민 공통 보안 모듈에서 개인정보 암호화, 마스킹, 접속 로그, IP 제한, 조회/다운로드 증적 기능 정리
- `carrot-chat`의 서버측 정책 제어 관점과 연결해 운영 정책은 UI가 아니라 서버에서 강제해야 한다는 관점을 보여주는 보조 근거
- 기술 근거: Node.js, PHP, AES-256-CBC, audit log, IP whitelist

## 자기소개서에 연결할 키워드

- "채팅 UI만 만든 것이 아니라 SDK 경계와 운영 정책을 함께 고민했습니다."
- "실시간 기능은 정상 케이스보다 끊김/재연결/상태 전이가 중요하다고 보고 상태머신을 테스트했습니다."
- "테스트를 많이 쓰는 것보다 원인을 빨리 좁힐 수 있는 층으로 나누는 것을 중요하게 봅니다."
- "운영 정책은 클라이언트 표시가 아니라 서버에서 강제되어야 한다고 생각합니다."
- "복잡한 요구사항일수록 구현 결과뿐 아니라 의사결정 맥락과 검증 기준을 문서로 남깁니다."

