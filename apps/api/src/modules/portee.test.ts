import { describe, expect, it } from "vitest";
import { CATALOGUE_MODULES, moduleDuCatalogue } from "./catalogue";
import {
  cleVille,
  etatAgence,
  etatDans,
  etatHerite,
  memePortee,
  type ReglageModule,
} from "./portee";

const colis = moduleDuCatalogue("colis")!;
const socle = moduleDuCatalogue("guichet_caisse")!;
const covoit = moduleDuCatalogue("covoit_vendeurs")!;

const reglage = (
  actif: boolean | null,
  ...exceptions: ReglageModule["exceptions"]
): ReglageModule => ({
  actif,
  exceptions,
});

describe("catalogue des modules", () => {
  it("compte 12 modules aux codes uniques, dont un seul socle", () => {
    expect(CATALOGUE_MODULES).toHaveLength(12);
    expect(new Set(CATALOGUE_MODULES.map((m) => m.code)).size).toBe(12);
    expect(CATALOGUE_MODULES.filter((m) => m.socle).map((m) => m.code)).toEqual(["guichet_caisse"]);
  });

  it("le socle est actif par défaut", () => {
    expect(socle.actifParDefaut).toBe(true);
  });
});

describe("cleVille", () => {
  it("ignore accents, casse, espaces et tirets", () => {
    expect(cleVille("Yaoundé")).toBe(cleVille("  yaounde "));
    expect(cleVille("Saint-Louis")).toBe(cleVille("saint louis"));
    expect(cleVille("Douala")).not.toBe(cleVille("Doula"));
  });
});

describe("memePortee", () => {
  it("compare le type, puis la gare ou la ville", () => {
    expect(memePortee({ type: "agence" }, { type: "agence" })).toBe(true);
    expect(memePortee({ type: "gare", id: "g1" }, { type: "gare", id: "g1" })).toBe(true);
    expect(memePortee({ type: "gare", id: "g1" }, { type: "gare", id: "g2" })).toBe(false);
    expect(memePortee({ type: "ville", nom: "Yaoundé" }, { type: "ville", nom: "yaounde" })).toBe(
      true,
    );
    expect(memePortee({ type: "gare", id: "x" }, { type: "ville", nom: "x" })).toBe(false);
    expect(memePortee({ type: "agence" }, { type: "ville", nom: "x" })).toBe(false);
  });
});

describe("etatAgence", () => {
  it("sans réglage, l'état par défaut du catalogue s'applique", () => {
    expect(etatAgence(colis, undefined)).toBe(true);
    expect(etatAgence(covoit, undefined)).toBe(false);
    expect(etatAgence(covoit, reglage(null))).toBe(false);
  });

  it("la règle de l'agence remplace le défaut", () => {
    expect(etatAgence(colis, reglage(false))).toBe(false);
    expect(etatAgence(covoit, reglage(true))).toBe(true);
  });

  it("le socle est toujours actif", () => {
    expect(etatAgence(socle, reglage(false))).toBe(true);
  });
});

describe("etatDans : la gare prime sur la ville, la ville sur l'agence", () => {
  const regle = reglage(
    true,
    { portee: { type: "ville", nom: "Douala" }, actif: false },
    { portee: { type: "gare", id: "bonanjo" }, actif: true },
  );

  it.each([
    ["gare avec exception, dans une ville éteinte", { gareId: "bonanjo", ville: "Douala" }, true],
    ["autre gare de la ville éteinte", { gareId: "akwa", ville: "Douala" }, false],
    ["ville seule", { gareId: null, ville: "douala" }, false],
    ["autre ville : règle de l'agence", { gareId: "mvan", ville: "Yaoundé" }, true],
    ["aucun contexte : règle de l'agence", { gareId: null, ville: null }, true],
  ])("%s", (_nom, contexte, attendu) => {
    expect(etatDans(colis, regle, contexte)).toBe(attendu);
  });

  it("une gare qui a l'exception prime même si sa ville dit le contraire", () => {
    const r = reglage(false, { portee: { type: "gare", id: "g" }, actif: true });
    expect(etatDans(colis, r, { gareId: "g", ville: "Nulle part" })).toBe(true);
  });

  it("le socle ignore toute exception", () => {
    const r = reglage(false, { portee: { type: "gare", id: "g" }, actif: false });
    expect(etatDans(socle, r, { gareId: "g", ville: null })).toBe(true);
  });
});

describe("etatHerite", () => {
  const r = reglage(true, { portee: { type: "ville", nom: "Douala" }, actif: false });

  it("une gare hérite de sa ville, puis de l'agence", () => {
    expect(etatHerite(colis, r, { type: "gare", id: "akwa" }, "Douala")).toBe(false);
    expect(etatHerite(colis, r, { type: "gare", id: "mvan" }, "Yaoundé")).toBe(true);
    expect(etatHerite(colis, r, { type: "gare", id: "inconnue" }, null)).toBe(true);
  });

  it("une ville hérite de l'agence", () => {
    expect(etatHerite(colis, r, { type: "ville", nom: "Douala" }, null)).toBe(true);
  });

  it("le socle hérite toujours de « actif »", () => {
    expect(etatHerite(socle, reglage(false), { type: "ville", nom: "Douala" }, null)).toBe(true);
  });
});
