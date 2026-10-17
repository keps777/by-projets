import type { patron } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  brouillonDepuis,
  comptesModifies,
  erreursDuBrouillon,
  estEnregistrable,
  nombreChangements,
  reglesModifiees,
  versReglesModifiables,
} from "./brouillon";

const REGLES: patron.ReglesAgence = {
  annulation: {
    gratuiteJusqua: "1h_avant",
    retenue: "selon_classe",
    retenueParClassePct: { classique: 10, vip: 20 },
  },
  caisse: { toleranceEcart: 1000, auDela: "pin_superviseur_et_patron" },
  cadence: { numeroObligatoire: true },
  fraisService: { montant: 250, priseEnChargeParAgence: false },
  comptesMomo: {
    mtn: { numeroMasque: "6 77 •• •• 02" },
    orange: { numeroMasque: "6 99 •• •• 77" },
  },
};

describe("brouillon des règles", () => {
  it("part des règles de l'API : aucun changement, rien à corriger", () => {
    const b = brouillonDepuis(REGLES);
    expect(b).toEqual({
      gratuiteJusqua: "1h_avant",
      retenue: "selon_classe",
      toleranceEcart: 1000,
      auDela: "pin_superviseur_et_patron",
      comptes: { mtn: "6 77 •• •• 02", orange: "6 99 •• •• 77" },
    });
    expect(nombreChangements(b, REGLES)).toBe(0);
    expect(estEnregistrable(erreursDuBrouillon(b, REGLES))).toBe(true);
  });

  it("compte une règle par champ changé, et remettre la valeur d'origine l'efface", () => {
    const b = { ...brouillonDepuis(REGLES), gratuiteJusqua: "jamais" as const, toleranceEcart: 0 };
    expect(reglesModifiees(b, REGLES)).toEqual(["gratuiteJusqua", "toleranceEcart"]);
    expect(nombreChangements(b, REGLES)).toBe(2);
    expect(
      nombreChangements({ ...b, gratuiteJusqua: "1h_avant", toleranceEcart: 1000 }, REGLES),
    ).toBe(0);
  });

  it("une tolérance de 0 est une valeur, une tolérance vide est une erreur", () => {
    const b = brouillonDepuis(REGLES);
    expect(estEnregistrable(erreursDuBrouillon({ ...b, toleranceEcart: 0 }, REGLES))).toBe(true);
    const vide = erreursDuBrouillon({ ...b, toleranceEcart: null }, REGLES);
    expect(vide.tolerance).toBe(true);
    expect(estEnregistrable(vide)).toBe(false);
  });

  it("un compte est modifié dès que son champ diffère du numéro masqué, et compte pour un changement", () => {
    const b = brouillonDepuis(REGLES);
    const retape = { ...b, comptes: { ...b.comptes, orange: "699887766" } };
    expect(comptesModifies(retape, REGLES)).toEqual(["orange"]);
    expect(nombreChangements(retape, REGLES)).toBe(1);
    // Des espaces autour du numéro masqué ne sont pas un changement.
    expect(
      comptesModifies({ ...b, comptes: { ...b.comptes, mtn: " 6 77 •• •• 02 " } }, REGLES),
    ).toEqual([]);
  });

  it("un compte retapé doit être un numéro ; un compte laissé masqué n'est jamais une erreur", () => {
    const b = brouillonDepuis(REGLES);
    const faux = erreursDuBrouillon({ ...b, comptes: { ...b.comptes, mtn: "12" } }, REGLES);
    expect(faux.comptes).toEqual(["mtn"]);
    expect(estEnregistrable(faux)).toBe(false);
    const masque = erreursDuBrouillon(
      { ...b, comptes: { ...b.comptes, mtn: "6 77 •• •• 03" } },
      REGLES,
    );
    expect(masque.comptes).toEqual(["mtn"]);
    const bon = erreursDuBrouillon(
      { ...b, comptes: { ...b.comptes, mtn: "6 70 11 22 33" } },
      REGLES,
    );
    expect(bon.comptes).toEqual([]);
  });

  it("le corps d'enregistrement garde ce que l'écran ne montre pas et laisse les comptes MoMo de côté", () => {
    const b = {
      ...brouillonDepuis(REGLES),
      retenue: "cinquante_pct" as const,
      toleranceEcart: 2500,
    };
    const corps = versReglesModifiables(b, REGLES);
    expect(corps).toEqual({
      annulation: {
        gratuiteJusqua: "1h_avant",
        retenue: "cinquante_pct",
        retenueParClassePct: { classique: 10, vip: 20 },
      },
      caisse: { toleranceEcart: 2500, auDela: "pin_superviseur_et_patron" },
      cadence: { numeroObligatoire: true },
      fraisService: { montant: 250, priseEnChargeParAgence: false },
    });
    expect(corps).not.toHaveProperty("comptesMomo");
  });
});
