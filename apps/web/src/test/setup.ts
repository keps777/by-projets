// Importé par vitest (vite.config.ts) : matchers jest-dom, nettoyage du DOM et du stockage entre les tests.
import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Les suites tournent en parallèle sur des machines chargées : 1 s (défaut) est trop court pour les findBy*.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    // Stockage indisponible : rien à nettoyer.
  }
});
