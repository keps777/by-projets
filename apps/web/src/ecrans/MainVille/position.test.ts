import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLE_DERNIERE_VILLE,
  VILLES_DESSERVIES,
  derniereVille,
  distanceKm,
  memoriserVille,
  positionNavigateur,
  villeProche,
} from "./position";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("détection de la ville par la position", () => {
  it("reconnaît chaque ville desservie depuis son centre", () => {
    for (const ville of VILLES_DESSERVIES) {
      expect(villeProche(ville)).toBe(ville.nom);
    }
  });

  it("reconnaît Douala depuis Akwa et Bonabéri", () => {
    expect(villeProche({ latitude: 4.0483, longitude: 9.7043 })).toBe("Douala");
    expect(villeProche({ latitude: 4.0777, longitude: 9.6806 })).toBe("Douala");
  });

  it("ne reconnaît aucune ville loin de toutes (pas de position inventée)", () => {
    // Entre Douala et Yaoundé, à plus de 40 km des deux.
    expect(villeProche({ latitude: 3.95, longitude: 10.6 })).toBeNull();
    // Gulf of Guinea.
    expect(villeProche({ latitude: 0, longitude: 0 })).toBeNull();
  });

  it("mesure la distance à vol d'oiseau (Douala - Yaoundé : environ 200 km)", () => {
    const [douala, yaounde] = VILLES_DESSERVIES;
    const km = distanceKm(douala!, yaounde!);
    expect(km).toBeGreaterThan(190);
    expect(km).toBeLessThan(210);
    expect(distanceKm(douala!, douala!)).toBe(0);
  });

  it("mémorise la dernière ville, et ignore une valeur vide", () => {
    expect(derniereVille()).toBeNull();
    memoriserVille("Bafoussam");
    expect(derniereVille()).toBe("Bafoussam");
    localStorage.setItem(CLE_DERNIERE_VILLE, "   ");
    expect(derniereVille()).toBeNull();
  });

  it("répond « pas de position » sans géolocalisation, et quand la permission est refusée", async () => {
    vi.stubGlobal("navigator", {});
    await expect(positionNavigateur.position()).resolves.toBeNull();

    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: unknown, erreur: (e: unknown) => void) => erreur({ code: 1 }),
      },
    });
    await expect(positionNavigateur.position()).resolves.toBeNull();
  });

  it("relève la position quand le navigateur la donne", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) =>
          ok({ coords: { latitude: 4.05, longitude: 9.7, accuracy: 20 } }),
      },
    });
    await expect(positionNavigateur.position()).resolves.toEqual({
      latitude: 4.05,
      longitude: 9.7,
    });
  });
});
