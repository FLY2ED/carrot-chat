import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin runs the Worker + Durable Object inside Vite's dev server
// using the real `workerd` runtime, so local dev mirrors production.
//
// Port is pinned away from Vite's 5173 default to avoid colliding with other
// local dev servers on the same machine — keeps Playwright's `reuseExistingServer`
// from latching onto an unrelated app.
export default defineConfig({
  plugins: [react(), cloudflare()],
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  // Multi-page on the CLIENT environment only (the chat demo + the operations
  // console as separate entries) — the Worker environment keeps its own entry.
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            main: `${import.meta.dirname}/index.html`,
            admin: `${import.meta.dirname}/admin.html`,
            docs: `${import.meta.dirname}/docs.html`,
          },
        },
      },
    },
  },
});
