import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // The `@/` alias is declared once here rather than pulled from tsconfig via a
  // plugin — one line, no ESM/CJS interop to go wrong.
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    // The athlete's timezone. Date bugs in this app are timezone bugs, so the
    // suite runs in Brazil rather than in whatever zone the machine is set to.
    env: { TZ: "America/Sao_Paulo" },
    include: ["tests/**/*.test.ts"],
    // The engines are pure functions; there is nothing to set up or tear down.
    globals: false,
  },
});
