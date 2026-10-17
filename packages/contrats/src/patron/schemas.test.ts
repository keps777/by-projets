import { describe, expect, it } from "vitest";
import { AlerteSchema, ChiffresDuJourSchema } from "./aujourdhui";
import { AnalysesSchema } from "./analyses";
import { FcfaSchema, HeureSchema, IsoDoualaSchema, JourSchema, MoisSchema } from "./commun";
import { SalleDeControleSchema } from "./controle";
import { ModuleAgenceSchema } from "./modules";

describe("conventions communes", () => {
  it("les montants sont des entiers de FCFA, signés si besoin", () => {
    expect(FcfaSchema.safeParse(2_610_000).success).toBe(true);
    expect(FcfaSchema.safeParse(-1000).success).toBe(true);
    expect(FcfaSchema.safeParse(2.61).success).toBe(false);
    expect(FcfaSchema.safeParse("2 610 000").success).toBe(false);
    expect(FcfaSchema.safeParse(Number.NaN).success).toBe(false);
  });

  it("les instants sont des ISO en Africa/Douala (+01:00)", () => {
    expect(IsoDoualaSchema.safeParse("2027-01-05T14:05:00.000+01:00").success).toBe(true);
    expect(IsoDoualaSchema.safeParse("2027-01-05T14:05:00+01:00").success).toBe(true);
    expect(IsoDoualaSchema.safeParse("2027-01-05T13:05:00.000Z").success).toBe(false);
    expect(IsoDoualaSchema.safeParse("2027-01-05T14:05:00.000+02:00").success).toBe(false);
    expect(IsoDoualaSchema.safeParse("14:05").success).toBe(false);
  });

  it("jours, mois et heures de départ", () => {
    expect(JourSchema.safeParse("2027-01-05").success).toBe(true);
    expect(JourSchema.safeParse("5 janvier").success).toBe(false);
    expect(MoisSchema.safeParse("2026-12").success).toBe(true);
    expect(MoisSchema.safeParse("2026-12-01").success).toBe(false);
    expect(HeureSchema.safeParse("09:15").success).toBe(true);
    expect(HeureSchema.safeParse("24:00").success).toBe(false);
    expect(HeureSchema.safeParse("9:15").success).toBe(false);
  });
});

describe("schémas stricts", () => {
  const chiffres = {
    recette: 2_610_000,
    variationPct: 8,
    comparaison: "mardi dernier",
    billets: 612,
    colis: 188,
    remplissagePct: 86,
    ecartTotal: -1000,
  };

  it("les chiffres du jour refusent un montant décimal, un taux hors bornes, un champ inconnu", () => {
    expect(ChiffresDuJourSchema.safeParse(chiffres).success).toBe(true);
    expect(ChiffresDuJourSchema.safeParse({ ...chiffres, recette: 2.61 }).success).toBe(false);
    expect(ChiffresDuJourSchema.safeParse({ ...chiffres, remplissagePct: 120 }).success).toBe(
      false,
    );
    expect(ChiffresDuJourSchema.safeParse({ ...chiffres, extra: true }).success).toBe(false);
  });

  it("une alerte porte une catégorie connue et un instant à Douala", () => {
    const alerte = {
      id: "a1",
      categorie: "ecart_caisse",
      texte: "Guichet 2 Akwa · écart − 1 000",
      quand: "2027-01-05T14:00:00.000+01:00",
      cibleId: null,
    };
    expect(AlerteSchema.safeParse(alerte).success).toBe(true);
    expect(AlerteSchema.safeParse({ ...alerte, categorie: "inconnue" }).success).toBe(false);
    expect(AlerteSchema.safeParse({ ...alerte, quand: "14:00" }).success).toBe(false);
  });

  it("un module a un code, un état et ses exceptions par gare ou par ville", () => {
    const module = {
      code: "relais",
      nom: "Points relais",
      actif: true,
      socle: false,
      detail: "Douala 12",
      exceptions: [
        { portee: { type: "gare", id: "gare-1" }, actif: false },
        { portee: { type: "ville", nom: "Bafoussam" }, actif: true },
      ],
    };
    expect(ModuleAgenceSchema.safeParse(module).success).toBe(true);
    expect(
      ModuleAgenceSchema.safeParse({
        ...module,
        exceptions: [{ portee: { type: "quartier", nom: "x" }, actif: true }],
      }).success,
    ).toBe(false);
  });

  it("les schémas de lecture sont exportés pour les deux adaptateurs", () => {
    expect(AnalysesSchema.safeParse({}).success).toBe(false);
    expect(SalleDeControleSchema.safeParse({}).success).toBe(false);
  });
});
