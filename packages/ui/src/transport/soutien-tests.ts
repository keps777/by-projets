// Mise en place commune des tests : matchers jest-dom et nettoyage du DOM entre deux tests
// (la configuration Vitest du package n'active pas les globales).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
