import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Les scripts lancent de vrais processus (bash, age, éventuellement PostgreSQL).
    testTimeout: 60_000,
  },
});
