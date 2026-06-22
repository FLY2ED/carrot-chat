---
"@naldadev/chat": minor
"@naldadev/chat-react": minor
---

Initial public release.

- `@naldadev/chat` — framework-agnostic WebSocket chat client: auto-reconnect
  (exponential backoff + jitter), heartbeat, pluggable transport, and a Zod
  `discriminatedUnion` protocol shared by client and server. Rich messages
  (`text` / `image` / `file` / `system` / `card` with inline actions) and a
  pure `maskContact` policy.
- `@naldadev/chat-react` — `useChatRoom` hook with optimistic sends, a
  reconnect-safe history merge, and a per-room store. Headless: bring your own UI.
