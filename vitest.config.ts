import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts on purpose: unit/component tests run in jsdom and
// must NOT load the Cloudflare (workerd) plugin. The Durable Object / real-time
// behaviour is covered end-to-end by Playwright instead.
export default defineConfig({
  plugins: [react()],
  // Resolve the workspace packages from source so unit tests run against the
  // exact files we ship (no build step between editing and testing).
  resolve: {
    alias: {
      "@naldadev/chat": `${import.meta.dirname}/packages/chat/src/index.ts`,
      "@naldadev/chat-react": `${import.meta.dirname}/packages/chat-react/src/index.ts`,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // Package unit tests + demo tests. Worker tests are limited to PURE modules
    // (no `cloudflare:workers` import); DO behaviour stays in Playwright.
    include: [
      "packages/**/src/**/*.test.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
      "worker/**/*.test.ts",
    ],
  },
});
