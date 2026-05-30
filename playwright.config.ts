import { defineConfig, devices } from "@playwright/test";

// End-to-end coverage of the real-time path: a real Vite dev server running the
// Worker + Durable Object in workerd, driven through a real browser.
//
// We pin the dev port (see vite.config.ts) so Playwright's `reuseExistingServer`
// can't latch onto an unrelated app already running on Vite's 5173 default.
const PORT = 5180;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry" },
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
