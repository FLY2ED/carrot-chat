# Resume Bullets

이력서/포트폴리오 페이지에 바로 옮기기 위한 짧은 문장입니다. 모두 코드/git/스토어 페이지로 검증된 사실만 적었습니다.

## 대표 프로젝트

### carrot-chat (이번 지원용 데모)

- 당근 채팅팀의 "재사용 가능한 웹채팅 SDK · 운영 정책 제어" 과제를 작게 재현한 실시간 채팅 데모
- WebSocket 연결·자동 재연결(지수 백오프)·하트비트·이벤트 모델을 프레임워크 비종속 `chat-core`로 분리하고, React는 Zustand로 이를 소비
- Cloudflare Durable Objects(WebSocket Hibernation) + SQLite로 방 단위 메시지 히스토리·읽음·타이핑·presence 처리
- 전화번호·이메일 마스킹을 클라이언트가 아닌 **서버 측 정책**으로 강제해 외부 거래 우회 가능성 축소
- 순수 함수·SDK 상태머신(가짜 WebSocket + fake timer)·입력 컴포넌트·실제 Durable Object E2E로 테스트 분리
- 검증: typecheck / Vitest 14 tests / production build / Playwright E2E 2 tests 전부 통과

기술 스택: React 19 · TypeScript · Zustand · Vite · Cloudflare Workers · Durable Objects · WebSocket · Vitest · Testing Library · Playwright

링크: Live https://carrot.naldadev.com · Code https://github.com/FLY2ED/carrot-chat

### artdata (미대 입시 AI 분석 실서비스)

- 학생↔강사 **Socket.io 기반 실시간 1:1 채팅을 원작자로 설계·구현** — 읽음 확인·타이핑·파일 메시지·연락처 자동 마스킹·어드민 채팅 모니터링·인앱 알림
- Claude/Gemini 이중 AI 파이프라인(tool-use 구조화 출력 + ephemeral 프롬프트 캐싱, SSE 챗봇 스트리밍) 설계
- 백엔드 Jest 통합 테스트 62개로 결제·입시 계산·채팅 등 핵심 도메인 로직 검증
- 925커밋 중 사용자 기여 약 84%로 주력 개발 (일부 공동), 약 22만 라인 운영 서비스
- AWS EC2 + Docker + Cloudflare Pages + Sentry + GitHub Actions(Claude 자동 코드리뷰) 운영

기술 근거: Vue 3 · Socket.IO · Express · Prisma · PostgreSQL · Jest · Anthropic/Google AI SDK · AWS · Cloudflare · Sentry

### KORI VOCA (한국어 학습 앱)

- React Native + TypeScript로 한국어 어휘 학습 앱 개발 (팀 '피피'), App Store 출시
- SM-2 간격 반복 알고리즘, 접근성(고대비·스크린리더·reduced motion) 적용
- **ST창업오디션 최우수상** (2025, 서울과학기술대학교)

기술 근거: React Native · TypeScript · Jest · 접근성

### 방송 편성·정산 운영툴 (실시간 어드민, 단독 개발)

- React + TypeScript + Zustand 프론트와 Django Channels(WebSocket) 백엔드로 편성을 실시간 동기화 (자동 재연결·필터 인지 머지)
- 선착순 정원은 `select_for_update` 비관적 락으로 동시성 race condition 차단
- ADMIN / SCHEDULE_MANAGER / FREELANCER 3역할 RBAC 어드민 + 정산 엑셀 내보내기

기술 근거: React 18 · TypeScript · Zustand · Django Channels · PostgreSQL · JWT

### Desktop Dday (Electron + Vue, 출시·수상·매각)

- Electron + Vue 3로 바탕화면 D-Day 위젯을 1인 개발해 Microsoft·Google·Apple **3개 스토어 출시**
- 투명·클릭통과 위젯, 멀티모니터, 트레이, 자정 정밀 갱신 등 데스크톱 네이티브 통합을 IPC로 직접 구현
- AWS Amplify(Cognito + AppSync + DataStore) 기기간 동기화 + Google/Apple OAuth
- **Disquiet 위클리 프로덕트** 선정, 운영 후 **매각(Exit)**

기술 근거: Electron · Vue 3 · Pinia · AWS Amplify · electron-builder

## 수상 · 자격

- 해양수산부 장관상 (2021) — 스마트 해상물류 경진대회, 영상처리 기반 스마트 물류창고
- 공군 개발사령관상 (2024) — 교육훈련 우수 콘텐츠 개발
- ST창업오디션 최우수상 (2025, 서울과기대) — KORI VOCA, 팀 '피피'
- Disquiet 위클리 프로덕트 (주간 득표 상위 3) — Desktop Dday
- COS PRO 1급 (Python)
- 크몽 NALDA: 평점 4.9/5.0, 리뷰 22건, 레벨 2

## 자기소개서에 연결할 키워드

- "채팅 UI만 만든 것이 아니라 SDK 경계와 운영 정책을 함께 고민했습니다."
- "실시간 기능은 정상 케이스보다 끊김/재연결/상태 전이가 중요하다고 보고 상태머신을 테스트했습니다."
- "테스트를 많이 쓰는 것보다 원인을 빨리 좁힐 수 있는 층으로 나누는 것을 중요하게 봅니다."
- "운영 정책은 클라이언트 표시가 아니라 서버에서 강제되어야 한다고 생각합니다."
- "작은 제품이라도 출시·운영·종료까지 책임지고 닫아본 경험이 있습니다 (Desktop Dday)."
- "복잡한 요구사항일수록 구현 결과뿐 아니라 의사결정 맥락과 검증 기준을 문서로 남깁니다."
