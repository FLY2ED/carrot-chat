import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin runs the Worker + Durable Object inside Vite's dev server
// using the real `workerd` runtime, so local dev mirrors production.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
