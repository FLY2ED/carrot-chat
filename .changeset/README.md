# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).

When you make a change to `@naldadev/chat` or `@naldadev/chat-react` that should
ship in a release, add a changeset:

```bash
pnpm changeset
```

Pick the affected packages, choose a semver bump (patch / minor / major), and
write a short summary. Commit the generated markdown file with your PR. On merge
to `main`, the Release workflow opens a "Version Packages" PR; merging that
publishes to npm.
