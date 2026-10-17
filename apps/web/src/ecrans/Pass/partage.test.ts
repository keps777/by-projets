import { afterEach, describe, expect, it, vi } from "vitest";
import { adresseWhatsApp, ouvrirWhatsApp } from "./partage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("partage WhatsApp", () => {
  it("encode le message dans l'adresse wa.me", () => {
    const message = "Mon billet : DLA → YDE & retour ? 100 %";
    const adresse = adresseWhatsApp(message);
    expect(adresse.startsWith("https://wa.me/?text=")).toBe(true);
    expect(new URL(adresse).searchParams.get("text")).toBe(message);
  });

  it("ouvre WhatsApp dans un nouvel onglet isolé de la page", () => {
    const ouvrir = vi.spyOn(globalThis, "open").mockImplementation(() => null);
    ouvrirWhatsApp("salut");
    expect(ouvrir).toHaveBeenCalledWith(
      "https://wa.me/?text=salut",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
