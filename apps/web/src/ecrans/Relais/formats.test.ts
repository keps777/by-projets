import type { colis as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  enLettres,
  etatDe,
  formaterDistance,
  formaterMontant,
  formaterNote,
  heureEnFrancais,
  minusculeInitiale,
  nomCourt,
  repereDe,
} from "./formats";

const point = (surcharge: Partial<contrats.PointRelais>): contrats.PointRelais => ({
  id: "relais-x",
  rang: 1,
  nom: "X",
  ouvert: true,
  fermeLe: null,
  distanceM: 100,
  horaires: "7 h–20 h",
  jours: null,
  note: 4.5,
  colisRemis: null,
  particularite: null,
  supplement: 300,
  ...surcharge,
});

describe("formaterMontant", () => {
  it("sépare les milliers par une espace ordinaire", () => {
    expect(formaterMontant(300)).toBe("300");
    expect(formaterMontant(1500)).toBe("1 500");
    expect(formaterMontant(25000)).toBe("25 000");
  });
});

describe("formaterDistance", () => {
  it("écrit les mètres sous le kilomètre", () => {
    expect(formaterDistance(350)).toBe("350 m");
    expect(formaterDistance(900)).toBe("900 m");
    expect(formaterDistance(999)).toBe("999 m");
  });

  it("écrit les kilomètres avec une virgule, sans « ,0 »", () => {
    expect(formaterDistance(1200)).toBe("1,2 km");
    expect(formaterDistance(1000)).toBe("1 km");
    expect(formaterDistance(2000)).toBe("2 km");
    expect(formaterDistance(12_340)).toBe("12,3 km");
  });
});

describe("formaterNote", () => {
  it("garde toujours une décimale, avec une virgule", () => {
    expect(formaterNote(4.9)).toBe("4,9");
    expect(formaterNote(5)).toBe("5,0");
  });
});

describe("enLettres et minusculeInitiale", () => {
  it("écrit les petits nombres en lettres et laisse les autres en chiffres", () => {
    expect(enLettres(1)).toBe("un");
    expect(enLettres(3)).toBe("trois");
    expect(enLettres(12)).toBe("12");
  });

  it("met seulement la première lettre en minuscule", () => {
    expect(minusculeInitiale("Marché A")).toBe("marché A");
    expect(minusculeInitiale("")).toBe("");
  });
});

describe("nomCourt", () => {
  it("retire « Boutique » en tête, comme le bouton de la planche", () => {
    expect(nomCourt("Boutique Mama Fotso")).toBe("Mama Fotso");
  });

  it("garde les autres noms entiers", () => {
    expect(nomCourt("Pharmacie du Marché")).toBe("Pharmacie du Marché");
    expect(nomCourt("Call-box Tonton Paul")).toBe("Call-box Tonton Paul");
    expect(nomCourt("Ma Boutique")).toBe("Ma Boutique");
  });

  it("ne rend jamais un nom vide", () => {
    expect(nomCourt("Boutique")).toBe("Boutique");
  });
});

describe("heureEnFrancais", () => {
  it("lit l'heure du contrat telle quelle (déjà à l'heure de Douala)", () => {
    expect(heureEnFrancais("2027-01-05T19:00:00.000+01:00")).toBe("19 h");
    expect(heureEnFrancais("2027-01-05T07:05:00+01:00")).toBe("7 h 05");
    expect(heureEnFrancais("pas une date")).toBe("");
  });
});

describe("etatDe", () => {
  it("distingue ouvert, ferme bientôt et fermé", () => {
    expect(etatDe(point({}))).toEqual({ type: "ouvert" });
    expect(etatDe(point({ fermeLe: "2027-01-05T19:00:00+01:00" }))).toEqual({
      type: "ferme-bientot",
      heure: "19 h",
    });
    expect(etatDe(point({ ouvert: false, fermeLe: null }))).toEqual({ type: "ferme" });
  });
});

describe("repereDe", () => {
  it("trouve le premier repère du type demandé", () => {
    const reperes: contrats.RelaisProches["reperes"] = [
      { type: "marche", libelle: "Marché A", rang: null },
      { type: "gare", libelle: "Gare Alpha", rang: null },
    ];
    expect(repereDe(reperes, "gare")?.libelle).toBe("Gare Alpha");
    expect(repereDe(reperes, "destinataire")).toBeUndefined();
  });
});
