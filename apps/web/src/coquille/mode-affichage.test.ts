import { describe, expect, it } from "vitest";
import {
  HAUTEUR_BOITIER,
  HAUTEUR_LIGNE_DEMO,
  LARGEUR_BOITIER,
  MARGE_FENETRE,
  echelleCadre,
  modeAffichage,
} from "./mode-affichage";

describe("modeAffichage : écran plein ou cadre d'iPhone", () => {
  it.each([
    [320, 568],
    [360, 740],
    [390, 844],
    [412, 915],
    [430, 932],
    [480, 1000],
    [600, 1200],
  ])("téléphone %i x %i : écran plein", (largeur, hauteur) => {
    expect(modeAffichage(largeur, hauteur)).toBe("plein");
  });

  it.each([
    [844, 390],
    [667, 375],
    [1024, 600],
    [1366, 759],
  ])("fenêtre courte %i x %i (paysage, petit ordinateur) : écran plein", (largeur, hauteur) => {
    expect(modeAffichage(largeur, hauteur)).toBe("plein");
  });

  it.each([
    [601, 760],
    [768, 1024],
    [1280, 800],
    [1440, 900],
    [2560, 1440],
  ])("ordinateur ou tablette %i x %i : cadre", (largeur, hauteur) => {
    expect(modeAffichage(largeur, hauteur)).toBe("cadre");
  });

  it("les seuils sont stricts en largeur (600 px reste un téléphone) et inclusifs en hauteur (760 px)", () => {
    expect(modeAffichage(600, 900)).toBe("plein");
    expect(modeAffichage(601, 900)).toBe("cadre");
    expect(modeAffichage(900, 759)).toBe("plein");
    expect(modeAffichage(900, 760)).toBe("cadre");
  });
});

describe("echelleCadre : le cadre tient dans la fenêtre sans jamais agrandir", () => {
  it("vaut 1 quand la fenêtre est assez grande", () => {
    expect(echelleCadre(1920, 1200)).toBe(1);
    expect(echelleCadre(1440, 1000)).toBe(1);
  });

  it("réduit selon la hauteur disponible, marges comprises", () => {
    const attendu = (900 - 2 * MARGE_FENETRE) / HAUTEUR_BOITIER;
    expect(echelleCadre(1440, 900)).toBeCloseTo(attendu, 3);
    expect(echelleCadre(1440, 900)).toBeLessThan(1);
  });

  it("retire la ligne du sélecteur de rôle de la hauteur disponible", () => {
    const sans = echelleCadre(1440, 900);
    const avec = echelleCadre(1440, 900, HAUTEUR_LIGNE_DEMO);
    expect(avec).toBeLessThan(sans);
    expect(avec).toBeCloseTo((900 - HAUTEUR_LIGNE_DEMO - 2 * MARGE_FENETRE) / HAUTEUR_BOITIER, 3);
  });

  it("réduit aussi selon la largeur quand la fenêtre est étroite", () => {
    expect(echelleCadre(300, 2000)).toBeCloseTo((300 - 2 * MARGE_FENETRE) / LARGEUR_BOITIER, 3);
  });

  it("le boîtier mis à l'échelle tient toujours dans la fenêtre (aucun défilement autour)", () => {
    for (const [l, h] of [
      [601, 760],
      [768, 1024],
      [1024, 768],
      [1280, 720 + 40],
      [1440, 900],
      [1920, 1080],
    ] as const) {
      const e = echelleCadre(l, h, HAUTEUR_LIGNE_DEMO);
      expect(LARGEUR_BOITIER * e).toBeLessThanOrEqual(l);
      expect(HAUTEUR_BOITIER * e + HAUTEUR_LIGNE_DEMO).toBeLessThanOrEqual(h);
    }
  });

  it("ne tombe jamais à zéro, même dans une fenêtre minuscule", () => {
    expect(echelleCadre(10, 10)).toBeGreaterThan(0);
  });
});
