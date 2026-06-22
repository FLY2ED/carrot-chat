# @naldadev/chat-react

[![npm](https://img.shields.io/npm/v/@naldadev/chat-react.svg)](https://www.npmjs.com/package/@naldadev/chat-react)
[![license](https://img.shields.io/npm/l/@naldadev/chat-react.svg)](https://github.com/FLY2ED/carrot-chat/blob/main/LICENSE)

React bindings for [`@naldadev/chat`](https://www.npmjs.com/package/@naldadev/chat).
A `useChatRoom` hook that binds a `ChatClient` to a per-room store with
**optimistic sends**, a **reconnect-safe history merge**, and infinite scroll —
all headless. You render the messages however you like.

> ESM-only. Peer deps: `react` (^18 || ^19) and `zustand` (^5).

## Install

```bash
npm install @naldadev/chat @naldadev/chat-react zod zustand
```

## Quickstart

```tsx
import { useChatRoom } from "@naldadev/chat-react";

function Chat() {
  const room = useChatRoom("lobby", "alice", "Alice");

  return (
    <>
      <div role="log" aria-live="polite">
        {room.messages.map((m) => (
          <div key={m.clientMsgId ?? m.id}>
            <b>{m.senderName}</b>: {m.text}
            {m.status === "sending" && " (sending…)"}
            {m.status === "failed" && (
              <button onClick={() => room.retry(m.clientMsgId!)}>retry</button>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => room.sendMessage("hi")}>Send</button>
    </>
  );
}
```

`room` exposes the reactive state (`messages`, `members`, `typing`, `reads`,
`status`, …) plus stable actions (`sendMessage`, `retry`, `loadOlder`,
`setTyping`, `markRead`, `compose`, `tapAction`, `attach`).

## Also exported

Pure state helpers for advanced use (e.g. custom stores or SSR):

```ts
import {
  buildWsUrl, getClientId,
  applyOptimistic, reconcileEcho, markFailed, mergeHistory, prependPage,
  createChatStore,
} from "@naldadev/chat-react";
```

## License

MIT © [박성재 (NALDA)](https://github.com/FLY2ED)
