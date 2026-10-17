import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scenarios/**/*.test.ts"],
    globalSetup: ["./support/pile.ts"],
    // Une vraie pile (PostgreSQL, API, navigateur) : on laisse le temps au démarrage, au hachage des PIN, aux builds.
    testTimeout: 120_000,
    hookTimeout: 300_000,
    // Les fichiers tournent l'un après l'autre : une seule base, un seul Chromium, des mesures de durée stables.
    fileParallelism: false,
  },
});
