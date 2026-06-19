# @naldadev/chat

The framework-agnostic core of carrot-chat: it owns the connection (transport,
auto-reconnect with exponential backoff + jitter, heartbeat), validates every
server frame with Zod, and fans typed events out to subscribers. **No React, no
DOM.** The React bindings in `src/react/` are just one consumer; the Cloudflare
Worker is another.

## Quickstart

```ts
import { ChatClient } from "@naldadev/chat";

const client = new ChatClient({ url: "wss://example.com/api/room/lobby/ws" });

client.onStatus((status) => console.log(status)); // connecting → open → reconnecting → closed
const off = client.on((event) => {
  if (event.type === "message") console.log(event.message.text);
});

client.connect();
client.send({ type: "send", text: "hello", clientMsgId: crypto.randomUUID() });

// later
off();
client.close();
```

## Public API

The `index.ts` barrel **is** the contract — import only from `@naldadev/chat`,
never from internal files. Internals (`reconnect.ts` backoff policy, the React
store wiring) can change without a breaking release.

| Export | Purpose |
|---|---|
| `ChatClient`, `ChatClientOptions` | the connection + event API |
| `Transport`, `TransportFactory`, `webSocketTransport` | swap the wire (WebSocket today, SSE/long-poll later) |
| `ClientEventSchema`, `ServerEventSchema`, `maskContact` | runtime validation + masking policy, **shared with the server** |
| `Message`, `ServerEvent`, `ClientEvent`, `Member`, `ConnectionStatus` | the event model types |

`nextDelay` / `withJitter` are intentionally **not** exported — internal policy.

## Custom transport

`ChatClient` talks to a `Transport`, not to `WebSocket` directly, so you can
inject a different wire (or a fake for tests):

```ts
import { ChatClient, type Transport } from "@naldadev/chat";

const sseTransport = (url: string): Transport => ({
  /* connect/send/on/close/state mapping onto an EventSource */
});

new ChatClient({ url, transport: sseTransport });
```

Tests inject a fake via the deprecated `WebSocketCtor` alias (kept for
backwards-compat) or a custom `transport`.

## Extracting to a published npm package

This folder is structured to lift out into its own workspace package unchanged.
The only additions needed are package metadata + a build step:

```jsonc
// package.json
{
  "name": "@naldadev/chat",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" }
  },
  "peerDependencies": { "zod": "^4.0.0" },
  "scripts": { "build": "tsup src/index.ts --format esm,cjs --dts" }
}
```

`zod` is a **peer** dependency so the consumer, the React bindings, and the
Worker all share one Zod instance (otherwise `discriminatedUnion` parsing and
`instanceof ZodError` break). In a pnpm workspace, pin it via `catalog:`. The
demo app and the Worker would then depend on `@naldadev/chat` by name instead
of the relative `../chat-core` path — no source changes inside this folder.
