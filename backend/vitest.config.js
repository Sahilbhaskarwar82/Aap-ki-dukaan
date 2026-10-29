import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.js"],
    // Integration tests spin up mongodb-memory-server — give them more time
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
    },
  },
});
