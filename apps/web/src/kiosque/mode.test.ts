import { afterEach, describe, expect, it } from "vitest";
import { CLE_KIOSQUE } from "./etat";
import { detecterModeKiosque } from "./mode";

afterEach(() => localStorage.clear());

const fenetre = (search = "", pleinEcran?: boolean) => ({
  location: { search },
  ...(pleinEcran === undefined
    ? {}
    : {
        matchMedia: (q: string) => ({ matches: pleinEcran && q === "(display-mode: fullscreen)" }),
      }),
});

describe("detecterModeKiosque", () => {
  it("n'est pas un kiosque par défaut", () => {
    expect(detecterModeKiosque(fenetre())).toEqual({ actif: false, source: null });
  });

  it("?kiosque=1 active le mode et le mémorise pour les lancements suivants", () => {
    expect(detecterModeKiosque(fenetre("?kiosque=1"))).toEqual({
      actif: true,
      source: "parametre",
    });
    expect(localStorage.getItem(CLE_KIOSQUE)).toBe("1");
    expect(detecterModeKiosque(fenetre())).toEqual({ actif: true, source: "memorise" });
  });

  it("?kiosque=0 le désactive (maintenance)", () => {
    detecterModeKiosque(fenetre("?kiosque=1"));
    expect(detecterModeKiosque(fenetre("?kiosque=0"))).toEqual({ actif: false, source: null });
    expect(detecterModeKiosque(fenetre())).toEqual({ actif: false, source: null });
  });

  it("reconnaît l'affichage plein écran", () => {
    expect(detecterModeKiosque(fenetre("", true))).toEqual({ actif: true, source: "plein-ecran" });
    expect(detecterModeKiosque(fenetre("", false))).toEqual({ actif: false, source: null });
  });

  it("une application installée en fenêtre simple n'est pas un kiosque", () => {
    const standalone = {
      location: { search: "" },
      matchMedia: (q: string) => ({ matches: q === "(display-mode: standalone)" }),
    };
    expect(detecterModeKiosque(standalone).actif).toBe(false);
  });

  it("ne plante pas quand matchMedia lève", () => {
    const casse = {
      location: { search: "" },
      matchMedia: () => {
        throw new Error("indisponible");
      },
    };
    expect(detecterModeKiosque(casse)).toEqual({ actif: false, source: null });
  });
});
