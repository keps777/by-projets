// Importé en tête de chaque fichier de test du kit : matchers jest-dom et nettoyage du DOM.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom n'a pas toujours PointerEvent : sans lui, clientX serait perdu dans les tests de glissement.
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEventJsdom extends MouseEvent {}
  Object.defineProperty(window, "PointerEvent", { value: PointerEventJsdom, configurable: true });
}
