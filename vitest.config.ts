import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts on purpose: unit/component tests run in jsdom and
// must NOT load the Cloudflare (workerd) plugin. The Durable Object / real-time
// behaviour is covered end-to-end by Playwright instead.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // Worker tests are limited to PURE modules (no `cloudflare:workers` import),
    // e.g. the assistant's offline routing. DO behaviour stays in Playwright.
    include: ["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts"],
  },
});
