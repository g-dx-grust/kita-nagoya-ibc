import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration test runner.
// - Uses a dedicated SQLite file at prisma/test.db (never touches dev.db).
// - globalSetup wipes the test DB and re-runs migrations before the suite.
// - Tests serialize via singleFork to avoid SQLite write contention.

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
    },
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
