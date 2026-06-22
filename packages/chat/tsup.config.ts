import { defineConfig } from "tsup";

// ESM-only on purpose: dual CJS/ESM risks loading two copies of peer deps (zod),
// which breaks instanceof / schema identity. See README for the rationale.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  treeshake: true,
  sourcemap: true,
  clean: true,
});
