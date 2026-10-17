import { agence } from "@afrimove/contrats";
import * as domaine from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import {
  FIN_PLAGES_APPAREILS,
  PLAGE_EN_LIGNE,
  analyserNumeros,
  jourValide,
  plageDuPlan,
  plageValide,
} from "./regles";
import { COMPAGNIE, GARE, monterNumerotation, uuid } from "./testing/montage";

/**
 * L'API ne peut pas importer le domaine ni les contrats à l'exécution (paquets non compilés, API en
 * CommonJS) : elle en recopie les règles. Ces tests les comparent aux sources, pour qu'une règle
 * modifiée d'un seul côté fasse échouer la CI.
 */
describe("parité avec @afrimove/domain", () => {
  it("plage des ventes en ligne : 4001–9999", () => {
    expect(PLAGE_EN_LIGNE).toEqual(domaine.PLAGE_EN_LIGNE);
    expect(FIN_PLAGES_APPAREILS).toBe(4000);
  });

  it("plageDuPlan = plageGuichet / plageConvoyeur du domaine", () => {
    for (let rang = 1; rang <= domaine.NB_GUICHETS_AVEC_PLAGE; rang++) {
      expect(plageDuPlan("guichet", rang, null)).toEqual(domaine.plageGuichet(rang));
    }
    for (let nb = 1; nb <= 12; nb++) {
      for (let rang = 1; rang <= nb; rang++) {
        expect(plageDuPlan("convoyeur", rang, nb)).toEqual(domaine.plageConvoyeur(rang, nb));
      }
    }
    expect(() => plageDuPlan("guichet", 4, null)).toThrow(RangeError);
    expect(() => plageDuPlan("convoyeur", 1, null)).toThrow(RangeError);
  });

  it("toutes les plages du plan tiennent sous la barre du serveur et sont valides", () => {
    for (let rang = 1; rang <= 3; rang++) {
      expect(plageValide(domaine.plageGuichet(rang))).toBe(true);
      expect(domaine.plageGuichet(rang).fin).toBeLessThanOrEqual(FIN_PLAGES_APPAREILS);
    }
    for (let nb = 1; nb <= 999; nb += 37) {
      const derniere = domaine.plageConvoyeur(nb, nb);
      expect(derniere.fin).toBeLessThanOrEqual(FIN_PLAGES_APPAREILS);
    }
  });

  it("analyserNumeros donne les mêmes trous et numéros hors plage que analyserSequences", () => {
    // générateur déterministe : le test doit se rejouer à l'identique
    let graine = 12345;
    const alea = () => (graine = (graine * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const plage = { debut: 1001, fin: 1999 };
    for (let essai = 0; essai < 200; essai++) {
      const n = Math.floor(alea() * 40);
      const numeros = new Set<number>();
      for (let i = 0; i < n; i++) numeros.add(Math.floor(alea() * 1300) + 900);
      const attendu = domaine.analyserSequences(numeros, plage);
      const obtenu = analyserNumeros(numeros, plage);
      expect(obtenu.trous).toEqual(attendu.trous);
      expect(obtenu.horsPlage).toEqual(attendu.horsPlage);
    }
  });

  it("jourValide reconnaît les AAMMJJ que produit aammjjDouala", () => {
    for (const instant of [
      "2027-01-05T05:30:00+01:00",
      "2028-02-29T12:00:00Z",
      "2026-12-31T23:30:00Z",
    ]) {
      expect(jourValide(domaine.aammjjDouala(instant))).toBe(true);
    }
    for (const mauvais of ["", "2701", "271305", "270132", "270100", "abcdef", "2701051"]) {
      expect(jourValide(mauvais)).toBe(false);
    }
  });
});

describe("conformité avec @afrimove/contrats", () => {
  it("le résumé d'un appareil se lit comme la plage de la planche « SuperviseurDebloquer »", async () => {
    const m = monterNumerotation();
    await m.plages.attribuer({
      appareilId: "g2",
      genre: "guichet",
      rang: 2,
      gareId: GARE,
      compagnieId: COMPAGNIE,
    });
    for (const numeroPlage of [1001, 1002, 1005]) {
      await m.controleNumeros.enregistrer({
        appareilId: "g2",
        jour: "270105",
        genre: "billet",
        numeroPlage,
        evenementId: uuid(),
        plage: null,
      });
    }
    const { plage, billets } = await m.numerotation.resume("g2", "270105");
    const schemaPlage = agence.SchemaSuperviseurAppareil.shape.enAttente.shape.plage;
    const lue = schemaPlage.safeParse({ ...plage, trous: billets.trous });
    expect(lue.success, JSON.stringify(lue.error?.issues)).toBe(true);
    expect(lue.data).toEqual({ debut: 1001, fin: 1999, trous: [1003, 1004] });
    expect(agence.SchemaPlage.safeParse(plage).success).toBe(true);
  });

  it("les plages attribuées sont des plages valides pour le contrat (1 à 9999)", async () => {
    const m = monterNumerotation();
    const a = await m.plages.attribuer({
      appareilId: "c1",
      genre: "convoyeur",
      rang: 1,
      nbConvoyeurs: 4,
      gareId: GARE,
      compagnieId: COMPAGNIE,
    });
    expect(agence.SchemaPlage.safeParse(a.plage).success).toBe(true);
  });
});
