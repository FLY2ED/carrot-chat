// Ambient augmentation for secrets that are NOT declared in wrangler.jsonc
// (so they don't land in the auto-generated worker-configuration.d.ts).
// Set in production with `wrangler secret put GEMINI_API_KEY`; for local dev put
// it in `.dev.vars`. When absent, the AI assistant falls back to an offline stub.
interface Env {
  GEMINI_API_KEY?: string;
}
