import { defineConfig } from "vitest/config";

// Database tests: need a local Postgres (DATABASE_URL's server). Each run creates a throwaway database.
export default defineConfig({
  test: { include: ["tests/db/**/*.test.ts"], environment: "node", testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
});
