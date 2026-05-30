import { defineConfig, devices } from "@playwright/test";

// End-to-end coverage of the real-time path: a real Vite dev server running the
// Worker + Durable Object in workerd, driven through a real browser.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: "http://localhost:5173", trace: "on-first-retry" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
