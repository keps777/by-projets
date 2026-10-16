// Réglages communs des tests du dossier : matchers jest-dom et nettoyage du DOM entre deux tests
// (Vitest tourne ici sans globals, donc le nettoyage automatique de Testing Library est à brancher).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
