# @naldadev/chat

[![npm](https://img.shields.io/npm/v/@naldadev/chat.svg)](https://www.npmjs.com/package/@naldadev/chat)
[![license](https://img.shields.io/npm/l/@naldadev/chat.svg)](https://github.com/FLY2ED/carrot-chat/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/@naldadev/chat.svg)](https://www.npmjs.com/package/@naldadev/chat)

Framework-agnostic real-time **web chat SDK**. A WebSocket client with
auto-reconnect (exponential backoff + jitter), heartbeat, a pluggable transport,
and a **Zod-validated protocol shared by client and server**. No React, no DOM —
bring your own UI (or use [`@naldadev/chat-react`](https://www.npmjs.com/package/@naldadev/chat-react)).

> ESM-only. Requires a runtime with native `WebSocket` (browsers, Workers,
> Node ≥ 22, Bun, Deno).

## Install

```bash
npm install @naldadev/chat zod
```

`zod` is a peer dependency — the client and your server share the **same** schema
instance so `discriminatedUnion` parsing stays sound.

## Quickstart

```ts
import { ChatClient } from "@naldadev/chat";

const client = new ChatClient({
  url: "wss://your-host/api/room/lobby/ws?user=me&name=Me",
});

client.onStatus((status) => {
  // "connecting" | "open" | "reconnecting" | "closed"
  console.log("status:", status);
});

const off = client.on((event) => {
  if (event.type === "message") {
    console.log(event.message.senderName, event.message.text);
  }
});

client.connect();
client.send({ type: "send", text: "Hello", clientMsgId: crypto.randomUUID() });

// later
off();
client.close();
```

## What you get

- **`ChatClient`** — `connect` / `on` / `onStatus` / `send` / `close`. Heartbeat
  ping/pong, stale-socket guard, and reconnect with exponential backoff + jitter
  are built in.
- **Pluggable transport** — defaults to WebSocket; inject `webSocketTransport`
  or your own `TransportFactory` (SSE, long-poll, a fake for tests).
- **Typed protocol = runtime-validated** — `ClientEventSchema` / `ServerEventSchema`
  are Zod `discriminatedUnion`s. Run `ServerEventSchema.safeParse` on every frame
  so a malformed or tampered payload never reaches your UI.
- **Rich messages** — `kind` of `text` / `image` / `file` / `system` / `card`
  (cards carry inline action buttons), plus `MediaSchema` / `CardSchema`.
- **`maskContact`** — a pure policy function that redacts phone numbers / emails
  (enforce it server-side to discourage off-platform deals).

## API surface

```ts
import {
  ChatClient,                 // the client
  webSocketTransport,         // default transport
  ClientEventSchema,          // validate what the client sends
  ServerEventSchema,          // validate what the server broadcasts
  MessageSchema, MemberSchema,
  MediaSchema, CardSchema, CardActionSchema,
  maskContact,                // (text, extraPatterns?) => string
} from "@naldadev/chat";

import type {
  ClientEvent, ServerEvent, Message, Member,
  ConnectionStatus, Media, Card,
} from "@naldadev/chat";
```

Reconnect policy internals (`nextDelay`, jitter) are intentionally **not**
exported — they're implementation details of `ChatClient`.

## Server

The reference backend is a Cloudflare Durable Object (WebSocket Hibernation +
embedded SQLite) that imports this same package for the protocol, so the schema
is shared end to end. See the [repo](https://github.com/FLY2ED/carrot-chat) for
the full demo (rich messages, media via R2, an AI assistant, JWT handshake, a
multi-room inbox, and an admin console).

## License

MIT © [박성재 (NALDA)](https://github.com/FLY2ED)
