# @naldadev/chat

A **reusable, framework-agnostic real-time web chat SDK** — a WebSocket client
with auto-reconnect, heartbeat, and a Zod-validated protocol shared by client and
server, with a Cloudflare **Durable Objects** reference backend.

**Live demo:** https://carrot.naldadev.com

```bash
npm install @naldadev/chat zod                 # headless core
npm install @naldadev/chat-react zustand       # + React bindings
```

## Packages

| Package | What | |
|---|---|---|
| [`@naldadev/chat`](packages/chat) | Framework-agnostic core: `ChatClient`, transport abstraction, reconnect, Zod protocol, `maskContact`. No React/DOM. | [![npm](https://img.shields.io/npm/v/@naldadev/chat.svg)](https://www.npmjs.com/package/@naldadev/chat) |
| [`@naldadev/chat-react`](packages/chat-react) | `useChatRoom` hook — optimistic sends, reconnect-safe merge, per-room store. Headless. | [![npm](https://img.shields.io/npm/v/@naldadev/chat-react.svg)](https://www.npmjs.com/package/@naldadev/chat-react) |

## Why

- **Typed protocol = runtime-validated.** Client, React bindings, and the Worker
  share one Zod `discriminatedUnion`. `safeParse` at the trust boundary — types
  alone are not a defence.
- **Connection is the hard part, so the SDK owns it.** Exponential backoff +
  jitter, heartbeat ping/pong, stale-socket guard, pluggable transport (WS / SSE).
- **Policy on the server.** Contact masking and rate limits run in the Durable
  Object — a client can't bypass them.
- **Rich messages built in.** `text` / `image` / `file` / `system` / `card`
  (cards carry inline action buttons) ride one extensible model.

## Repo layout (pnpm monorepo)

```
packages/chat        → @naldadev/chat        (published)
packages/chat-react  → @naldadev/chat-react  (published)
src, worker, *.html  → the demo app on Cloudflare Durable Objects (not published)
e2e                  → Playwright end-to-end tests
```

The demo imports the packages **straight from source** via a Vite alias, so
editing `packages/*/src` hot-reloads in the demo. Published consumers get the
tsup-built `dist` through each package's `exports` map (ESM-only).

The demo additionally showcases media uploads (R2), an in-room AI assistant
(Gemini tool-use with an offline fallback), a JWT handshake, a multi-room inbox
with offline delivery + notifications, and a read-only admin console.

## Develop

```bash
pnpm install        # Node ≥ 20, pnpm ≥ 9
pnpm dev            # demo at http://localhost:5180
pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
pnpm check:dist     # build packages + publint + are-the-types-wrong
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Releases are managed with
[Changesets](.changeset/README.md).

## License

MIT © [박성재 (NALDA)](https://github.com/FLY2ED)

---

<details>
<summary>당근 채팅팀 지원 맥락 (application context)</summary>

이 SDK는 당근 채팅팀의 "재사용 가능한 웹채팅 SDK" 미션을 재현하며 시작했습니다.
제출용 보조 문서는 `docs/`에 정리되어 있습니다 —
[리서치](docs/daangn-chat-research.md) ·
[근거 매핑](docs/evidence-map.md) ·
[지원서 초안](docs/application-draft.md) ·
[이력서 bullet](docs/resume-bullets.md) ·
[체크리스트](docs/submission-checklist.md).

</details>
