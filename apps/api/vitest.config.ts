import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC est nécessaire pour les décorateurs NestJS (métadonnées d'injection de dépendances).
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Le hachage argon2 et la création de modules Nest prennent quelques centaines de ms.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
