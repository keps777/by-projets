// Préparation commune des tests du kit « données » (à importer en premier dans chaque *.test.tsx).
// Vitest tourne ici avec `globals: false` : on branche à la main les matchers jest-dom
// et le nettoyage du DOM entre deux tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
