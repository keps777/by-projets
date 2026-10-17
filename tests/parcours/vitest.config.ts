import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scenarios/**/*.test.ts"],
    globalSetup: ["./support/serveur-global.ts"],
    // Un vrai navigateur, une vraie application : on laisse le temps au démarrage et aux paiements simulés.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Les fichiers tournent l'un après l'autre : un seul Chromium à la fois, des mesures stables.
    fileParallelism: false,
  },
});
