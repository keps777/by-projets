import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les tests lisent css/*.css en texte brut (?raw) : Vitest vide les CSS par défaut.
    css: { include: [/css\/.*\.css/] },
  },
});
