import * as domaine from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import * as regles from "./regles";
import { aammjjDouala, heureDouala, versIsoDouala } from "./temps";

/**
 * L'API ne peut pas importer le domaine à l'exécution : elle en recopie les règles de billetterie.
 * Ces tests les comparent à la source : une règle modifiée d'un seul côté fait échouer la CI.
 */
describe("parité avec @afrimove/domain", () => {
  it("états, actions et transitions du billet", () => {
    expect([...regles.ETATS_BILLET]).toEqual([...domaine.ETATS_BILLET]);
    expect(regles.TRANSITIONS_BILLET).toEqual(domaine.MACHINE_BILLET.transitions);
    for (const etat of domaine.ETATS_BILLET) {
      for (const action of domaine.ACTIONS_BILLET) {
        expect(regles.billetPeut(etat, action), `${etat}/${action}`).toBe(
          domaine.peutAppliquer(domaine.MACHINE_BILLET, etat, action),
        );
      }
    }
  });

  it("états, actions et transitions du départ", () => {
    expect([...regles.ETATS_DEPART]).toEqual([...domaine.ETATS_DEPART]);
    expect([...regles.ACTIONS_DEPART]).toEqual([...domaine.ACTIONS_DEPART]);
    expect(regles.TRANSITIONS_DEPART).toEqual(domaine.MACHINE_DEPART.transitions);
    for (const etat of domaine.ETATS_DEPART) {
      for (const action of domaine.ACTIONS_DEPART) {
        expect(regles.departPeut(etat, action), `${etat}/${action}`).toBe(
          domaine.peutAppliquer(domaine.MACHINE_DEPART, etat, action),
        );
      }
    }
  });

  it("constantes : blocage de 15 minutes, frais de 250 F, arrondi 100 F, plages", () => {
    expect(regles.BLOCAGE_SIEGE_MINUTES).toBe(domaine.BLOCAGE_SIEGE_MINUTES);
    expect(regles.FRAIS_VOYAGEUR_EN_LIGNE).toBe(domaine.TARIFS.fraisVoyageurEnLigne);
    expect(regles.ARRONDI_PRORATA).toBe(domaine.ARRONDI_PRORATA);
    expect(regles.PLAGE_EN_LIGNE).toEqual(domaine.PLAGE_EN_LIGNE);
    expect(regles.NB_GUICHETS_AVEC_PLAGE).toBe(domaine.NB_GUICHETS_AVEC_PLAGE);
    for (let rang = 1; rang <= domaine.NB_GUICHETS_AVEC_PLAGE; rang++) {
      expect(regles.plageGuichet(rang)).toEqual(domaine.plageGuichet(rang));
    }
    expect(() => regles.plageGuichet(4)).toThrow(RangeError);
    expect(() => regles.plageGuichet(0)).toThrow(RangeError);
  });

  it("annulation : gratuite puis retenue par classe, identique au domaine", () => {
    const heureDepart = "2026-11-02T14:00:00+01:00";
    const etats = domaine.ETATS_BILLET;
    for (const etat of etats) {
      for (const classe of ["classique", "vip"] as const) {
        for (const minutesAvant of [600, 61, 60, 59, 30, 1, 0, -30]) {
          const maintenant = new Date(Date.parse(heureDepart) - minutesAvant * 60_000);
          const p = { etat, prix: 4500, classe, heureDepart, maintenant };
          expect(regles.decisionAnnulation(p), `${etat} ${classe} ${minutesAvant}`).toEqual(
            domaine.decisionAnnulation(p),
          );
        }
      }
    }
    expect(regles.limiteAnnulationGratuite(heureDepart)).toBe(
      domaine.limiteAnnulationGratuite(heureDepart),
    );
    expect(regles.REGLES_PAR_DEFAUT.annulationGratuiteMinutes).toBe(
      domaine.REGLES_PAR_DEFAUT.annulationGratuiteMinutes,
    );
    expect(regles.REGLES_PAR_DEFAUT.retenueApresDelaiPct).toEqual(
      domaine.REGLES_PAR_DEFAUT.retenueApresDelaiPct,
    );
  });

  it("annulation : les montants attendus (25 % classique, 50 % VIP)", () => {
    const heureDepart = "2026-11-02T14:00:00+01:00";
    const a = (classe: "classique" | "vip", minutesAvant: number) =>
      regles.decisionAnnulation({
        etat: "paye",
        prix: 4000,
        classe,
        heureDepart,
        maintenant: new Date(Date.parse(heureDepart) - minutesAvant * 60_000),
      });
    expect(a("classique", 120)).toEqual({
      autorise: true,
      gratuite: true,
      retenue: 0,
      remboursement: 4000,
    });
    expect(a("classique", 30)).toEqual({
      autorise: true,
      gratuite: false,
      retenue: 1000,
      remboursement: 3000,
    });
    expect(a("vip", 30)).toEqual({
      autorise: true,
      gratuite: false,
      retenue: 2000,
      remboursement: 2000,
    });
    expect(a("classique", 0)).toMatchObject({ autorise: true, remboursement: 0, retenue: 4000 });
    expect(
      regles.decisionAnnulation({
        etat: "embarque",
        prix: 4000,
        classe: "classique",
        heureDepart,
        maintenant: new Date(Date.parse(heureDepart) - 600 * 60_000),
      }),
    ).toMatchObject({ autorise: false, remboursement: 0 });
  });

  it("devis, prorata, numéro et code de billet", () => {
    for (const enLigne of [true, false]) {
      expect(regles.devisBillet(4000, enLigne)).toEqual(domaine.devisBillet(4000, enLigne));
    }
    const arrets = [
      { id: "a", nom: "Douala", ordre: 0, kmDepuisOrigine: 0, montee: true },
      { id: "b", nom: "Édéa", ordre: 1, kmDepuisOrigine: 65, montee: true },
      { id: "c", nom: "Yaoundé", ordre: 2, kmDepuisOrigine: 250, montee: false },
    ];
    for (const [depuisArretId, versArretId] of [
      ["a", "b"],
      ["b", "c"],
      ["a", "c"],
    ] as const) {
      const p = { arrets, prixTrajetComplet: 4000, depuisArretId, versArretId };
      expect(regles.prixProrata(p)).toBe(domaine.prixProrata(p));
    }
    expect(() =>
      regles.prixProrata({ arrets, prixTrajetComplet: 4000, depuisArretId: "c", versArretId: "a" }),
    ).toThrow(RangeError);
    const at = "2026-11-02T09:00:00+01:00";
    const numero = regles.numeroBillet({
      agence: "ALP",
      gare: "DLA",
      aammjj: aammjjDouala(at),
      sequence: 42,
    });
    expect(numero).toBe(domaine.numeroBillet({ agence: "ALP", gare: "DLA", at, sequence: 42 }));
    expect(regles.analyserNumeroBillet(numero)).toEqual(domaine.analyserNumeroBillet(numero));
    const pris = new Set(["0123", "4567"]);
    const suite = (g: typeof regles.genererCodeBilletUnique) => {
      const a = (() => {
        let n = 0.123;
        return () => (n = (n * 7919 + 0.137) % 1);
      })();
      return Array.from({ length: 20 }, () => g(a, pris));
    };
    expect(suite(regles.genererCodeBilletUnique)).toEqual(suite(domaine.genererCodeBilletUnique));
    expect(regles.finBlocageSiege(at)).toBe(domaine.finBlocageSiege(at));
  });

  it("seuls guichetier, convoyeur et vendeur vendent (AfriMove jamais)", () => {
    for (const role of [
      "guichetier",
      "convoyeur",
      "vendeur",
      "voyageur",
      "afrimove",
      "patron",
      "superviseur",
    ] as const) {
      expect(regles.peutVendre(role), role).toBe(domaine.peutVendre(role));
    }
    expect(regles.peutVendre("afrimove")).toBe(false);
  });
});

describe("codes de billet", () => {
  it("quatre chiffres, jamais un code déjà pris dans le départ", () => {
    const pris = new Set<string>();
    for (let n = 0; n < 9990; n++) pris.add(String(n).padStart(4, "0"));
    for (let i = 0; i < 50; i++) {
      const code = regles.genererCodeBilletUnique(Math.random, pris);
      expect(code).toMatch(/^\d{4}$/);
      expect(pris.has(code)).toBe(false);
    }
    for (let n = 9990; n < 10_000; n++) pris.add(String(n).padStart(4, "0"));
    expect(() => regles.genererCodeBilletUnique(Math.random, pris)).toThrow();
  });
});

describe("plan du bus", () => {
  it("quatre colonnes : fenêtre, couloir, près de la porte à la première rangée", () => {
    expect(regles.emplacementSiege(1)).toBe("fenêtre · près de la porte");
    expect(regles.emplacementSiege(2)).toBe("couloir · près de la porte");
    expect(regles.emplacementSiege(4)).toBe("fenêtre · près de la porte");
    expect(regles.emplacementSiege(5)).toBe("fenêtre");
    expect(regles.emplacementSiege(7)).toBe("couloir");
  });

  it("places côte à côte : les paires (1,2) et (3,4) de chaque rangée", () => {
    expect(regles.aPlacesCoteACote(new Set([1, 2]))).toBe(true);
    expect(regles.aPlacesCoteACote(new Set([3, 4]))).toBe(true);
    expect(regles.aPlacesCoteACote(new Set([2, 3]))).toBe(false); // de part et d'autre du couloir
    expect(regles.aPlacesCoteACote(new Set([1, 3, 5, 7]))).toBe(false);
    expect(regles.aPlacesCoteACote(new Set())).toBe(false);
  });
});

describe("heures de Douala", () => {
  it("convertit un instant UTC en heure locale (+01:00)", () => {
    expect(versIsoDouala(new Date("2026-11-02T08:00:00.000Z"))).toBe(
      "2026-11-02T09:00:00.000+01:00",
    );
    expect(heureDouala("2026-11-02T23:30:00+01:00")).toBe(23);
    expect(aammjjDouala("2026-11-02T23:30:00+01:00")).toBe("261102");
    // 23:30 UTC est déjà le lendemain à Douala.
    expect(aammjjDouala(new Date("2026-11-02T23:30:00Z"))).toBe("261103");
  });
});
