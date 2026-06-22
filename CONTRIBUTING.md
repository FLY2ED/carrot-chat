# Contributing

Thanks for your interest in `@naldadev/chat`! This is a pnpm monorepo.

## Layout

| Path | What |
|---|---|
| `packages/chat` | `@naldadev/chat` — framework-agnostic core (publishable) |
| `packages/chat-react` | `@naldadev/chat-react` — React bindings (publishable) |
| `src`, `worker`, `*.html` | the demo app (Cloudflare Durable Objects) — not published |
| `e2e` | Playwright end-to-end tests |

The demo imports the packages straight from source via a Vite alias, so editing
`packages/*/src` hot-reloads in the demo — no build step while developing.

## Setup

```bash
pnpm install        # Node ≥ 20, pnpm ≥ 9
pnpm dev            # demo at http://localhost:5180 (workerd via @cloudflare/vite-plugin)
```

## Checks (run before opening a PR)

```bash
pnpm typecheck          # tsc across the demo + packages
pnpm test               # Vitest unit/component tests
pnpm build              # demo build (client + worker)
pnpm test:e2e           # Playwright (spins up a fresh dev server)
pnpm check:dist         # build packages + publint + are-the-types-wrong
```

## Changesets

If your change affects a published package, add a changeset:

```bash
pnpm changeset
```

Commit the generated file with your PR. See `.changeset/README.md`.

## Conventions

- TypeScript strict; comments explain **why**, not what.
- The protocol is a Zod `discriminatedUnion` and is the single source of truth —
  validate at the trust boundary (`safeParse`), never trust types alone.
- Keep `@naldadev/chat` free of React/DOM; keep `@naldadev/chat-react` headless.
