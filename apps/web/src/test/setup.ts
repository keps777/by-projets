// Importé par vitest (vite.config.ts) : matchers jest-dom, nettoyage du DOM et du stockage entre les tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // Stockage indisponible : rien à nettoyer.
  }
});
