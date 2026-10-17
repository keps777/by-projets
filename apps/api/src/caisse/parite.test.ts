import * as contrats from "@afrimove/contrats";
import * as domaine from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import { lireCloture, lireComptage, lireOuverture } from "./evenements";
import * as regles from "./regles";
import * as temps from "./temps";
import { ISO_ESSAIS, UUID_ESSAIS, variantes } from "./testing/mutations";

/**
 * L'API ne peut pas importer `@afrimove/domain` ni `@afrimove/contrats` à l'exécution (paquets non
 * compilés) : elle en recopie les règles et relit les événements à la main. Ces tests comparent la
 * copie à la source, valeur par valeur : si le domaine ou le contrat change, la CI échoue ici.
 */

const c = contrats.agence;

describe("règles de la caisse : mêmes valeurs que @afrimove/domain", () => {
  it("constantes", () => {
    expect(regles.COUPURES).toEqual(domaine.COUPURES);
    expect(regles.TOLERANCE_ECART_DEFAUT).toBe(domaine.REGLES_PAR_DEFAUT.toleranceEcart);
    expect(regles.ESSAIS_PIN_MAX).toBe(domaine.ESSAIS_PIN_MAX);
    expect(regles.BLOCAGE_PIN_MINUTES).toBe(domaine.BLOCAGE_PIN_MINUTES);
    expect(regles.ANNULATION_GRATUITE_MINUTES).toBe(
      domaine.REGLES_PAR_DEFAUT.annulationGratuiteMinutes,
    );
    expect(regles.RETENUE_APRES_DELAI_PCT).toEqual(domaine.REGLES_PAR_DEFAUT.retenueApresDelaiPct);
  });

  it("états du billet : annulables et reportables suivent la machine d'états du domaine", () => {
    expect(regles.ETATS_BILLET).toEqual(domaine.ETATS_BILLET);
    const annulables = domaine.ETATS_BILLET.filter((e) =>
      domaine.peutAppliquer(domaine.MACHINE_BILLET, e, "annuler"),
    );
    const reportables = domaine.ETATS_BILLET.filter((e) =>
      domaine.peutAppliquer(domaine.MACHINE_BILLET, e, "reporter"),
    );
    expect([...regles.ETATS_ANNULABLES].sort()).toEqual([...annulables].sort());
    expect([...regles.ETATS_REPORTABLES].sort()).toEqual([...reportables].sort());
    // Jamais après l'embarquement.
    expect(regles.ETATS_ANNULABLES).not.toContain("embarque");
    expect(regles.ETATS_ANNULABLES).not.toContain("voyage");
  });

  it("totalCoupures : mêmes totaux, mêmes erreurs", () => {
    const cas: [Record<number, number>, number][] = [
      [{}, 0],
      [{ 10_000: 2, 5_000: 1, 1_000: 3 }, 0],
      [{ 500: 7 }, 750],
      [{ 10_000: 0, 2_000: 4 }, 1],
      [{ 20_000: 1 }, 0], // coupure inconnue
      [{ 500: -1 }, 0],
      [{ 500: 1.5 }, 0],
      [{ 500: 1 }, 2.5],
    ];
    for (const [nombres, pieces] of cas) {
      const liste = Object.entries(nombres).map(([valeur, nombre]) => ({
        valeur: Number(valeur),
        nombre,
      }));
      const attendu = essayer(() => domaine.totalCoupures(nombres, pieces));
      const obtenu = essayer(() => regles.totalCoupures(liste, pieces));
      expect(obtenu, JSON.stringify({ nombres, pieces })).toEqual(attendu);
    }
    // Plus strict que le domaine, comme le contrat (`pieces` positif) : pas de pièces négatives ni de coupure répétée.
    expect(() => regles.totalCoupures([], -5)).toThrow(RangeError);
    expect(() =>
      regles.totalCoupures([
        { valeur: 500, nombre: 1 },
        { valeur: 500, nombre: 1 },
      ]),
    ).toThrow(RangeError);
  });

  it("cashAttendu : mêmes résultats, mêmes refus", () => {
    const montants = [0, 500, 25_000, 43_000];
    for (const fondDeCaisse of montants) {
      for (const billetsCash of montants) {
        for (const annulationsValidees of [0, 7_500]) {
          const p = { fondDeCaisse, billetsCash, colisCash: 2_500, annulationsValidees };
          expect(regles.cashAttendu(p)).toBe(domaine.cashAttendu(p));
        }
      }
    }
    for (const mauvais of [-1, 1.5]) {
      const p = { fondDeCaisse: mauvais, billetsCash: 0, colisCash: 0, annulationsValidees: 0 };
      expect(essayer(() => regles.cashAttendu(p))).toEqual(essayer(() => domaine.cashAttendu(p)));
      expect(() => regles.cashAttendu(p)).toThrow(RangeError);
    }
  });

  it("evaluerEcart : au franc près, mêmes statuts, pour toutes les tolérances", () => {
    for (const tolerance of [0, 500, 1_000, undefined]) {
      for (const ecart of [-2_000, -1_001, -1_000, -999, -1, 0, 1, 999, 1_000, 1_001, 2_000]) {
        const attendu = 25_000;
        const compte = attendu + ecart;
        expect(regles.evaluerEcart(attendu, compte, tolerance)).toEqual(
          domaine.evaluerEcart(attendu, compte, tolerance),
        );
      }
    }
    expect(() => regles.evaluerEcart(1, 1, -1)).toThrow(RangeError);
    expect(() => regles.evaluerEcart(1.5, 1)).toThrow(RangeError);
  });

  it("clôture automatique à minuit de Douala : mêmes instants", () => {
    const ouvertures = [
      "2026-11-02T00:00:00.000+01:00",
      "2026-11-02T09:00:00.000+01:00",
      "2026-11-02T23:59:59.999+01:00",
      "2026-12-31T23:30:00.000+01:00",
      "2027-03-01T00:00:00.000+01:00",
    ];
    for (const ouverteA of ouvertures) {
      expect(regles.heureClotureAuto(ouverteA)).toBe(domaine.heureClotureAuto(ouverteA));
      const minuit = Date.parse(domaine.heureClotureAuto(ouverteA));
      for (const maintenant of [
        minuit - 1,
        minuit,
        minuit + 1,
        minuit + 3_600_000,
        Date.parse(ouverteA),
      ]) {
        expect(regles.doitCloturerAuto(ouverteA, maintenant), `${ouverteA} / ${maintenant}`).toBe(
          domaine.doitCloturerAuto(ouverteA, maintenant),
        );
      }
    }
  });

  it("decisionAnnulation : gratuite, retenue 25 % ou 50 %, plafond au prix, après le départ tout est retenu", () => {
    const maintenant = "2026-11-02T10:00:00.000+01:00";
    for (const etat of domaine.ETATS_BILLET) {
      for (const classe of ["classique", "vip"] as const) {
        for (const minutes of [-120, -1, 0, 1, 15, 30, 59, 60, 61, 600]) {
          for (const prix of [0, 1, 500, 7_500, 7_510, 10_000, 12_345]) {
            const heureDepart = temps.versIsoDouala(Date.parse(maintenant) + minutes * 60_000);
            const attendu = domaine.decisionAnnulation({
              etat,
              prix,
              classe,
              heureDepart,
              maintenant,
            });
            const obtenu = regles.decisionAnnulation({
              etat,
              prix,
              classe,
              heureDepart,
              maintenant,
            });
            expect(obtenu, JSON.stringify({ etat, classe, minutes, prix })).toEqual({
              autorise: attendu.autorise,
              gratuite: attendu.gratuite,
              retenue: attendu.retenue,
              remboursement: attendu.remboursement,
            });
          }
        }
      }
    }
  });
});

describe("heures de Douala : mêmes résultats que @afrimove/domain", () => {
  const instants = [
    0,
    Date.parse("2026-11-02T08:00:00.000Z"),
    Date.parse("2026-11-02T22:59:59.999Z"),
    Date.parse("2026-11-02T23:00:00.000Z"),
    Date.parse("2026-12-31T23:30:00.000Z"),
    "2027-03-01T00:00:00.000+01:00",
    new Date("2028-02-29T12:00:00.000Z"),
  ];

  it("versIsoDouala, aammjjDouala, jourDouala, minuitSuivantDoualaMs", () => {
    for (const i of instants) {
      expect(temps.versIsoDouala(i)).toBe(domaine.versIsoDouala(i));
      expect(temps.aammjjDouala(i)).toBe(domaine.aammjjDouala(i));
      expect(temps.jourDouala(i)).toBe(domaine.jourDouala(i));
      expect(temps.minuitSuivantDoualaMs(i)).toBe(domaine.minuitSuivantDoualaMs(i));
    }
  });

  it("debutJourDoualaMs, joursEntre et jourMoisCourt : calendrier de Douala", () => {
    // 23:30 UTC le 2 novembre, c'est déjà le 3 à Douala.
    const tard = Date.parse("2026-11-02T23:30:00.000Z");
    expect(temps.versIsoDouala(temps.debutJourDoualaMs(tard))).toBe(
      "2026-11-03T00:00:00.000+01:00",
    );
    expect(temps.joursEntre("2026-11-02T23:59:59.999+01:00", "2026-11-03T00:00:00.000+01:00")).toBe(
      1,
    );
    expect(temps.joursEntre("2026-11-02T00:00:00.000+01:00", "2026-11-02T23:59:59.999+01:00")).toBe(
      0,
    );
    expect(temps.joursEntre("2026-11-09T10:00:00.000+01:00", "2026-11-02T10:00:00.000+01:00")).toBe(
      -7,
    );
    expect(temps.jourMoisCourt("2026-01-05T08:00:00.000+01:00")).toBe("5 janv.");
    expect(temps.jourMoisCourt("2026-02-01T00:00:00.000+01:00")).toBe("1 févr.");
    expect(temps.jourMoisCourt("2026-12-31T23:00:00.000+01:00")).toBe("31 déc.");
  });
});

describe("événements de la caisse : le lecteur fait comme le schéma zod du contrat", () => {
  const enveloppe = (type: string, donnees: unknown, cible: { type: string; id: string }) => ({
    id: "00000000-0000-4000-8000-000000000001",
    type,
    at: "2026-11-02T09:00:00.000+01:00",
    appareilId: "GU2-DLA",
    auteurId: "agent-1",
    cible,
    numeroPlage: null,
    donnees,
  });
  const session = { type: "session", id: "s1" };

  const cas = [
    {
      nom: "caisse.ouverte",
      schema: c.EVENEMENT_CAISSE_OUVERTE.schema,
      lire: lireOuverture,
      valide: enveloppe(
        "caisse.ouverte",
        { sessionId: "s1", numero: "K-DLA-261102-2-1", guichetId: "g2", fondDeCaisse: 25_000 },
        session,
      ),
    },
    {
      nom: "caisse.comptee",
      schema: c.EVENEMENT_CAISSE_COMPTEE.schema,
      lire: lireComptage,
      valide: enveloppe(
        "caisse.comptee",
        {
          sessionId: "s1",
          coupures: [
            { valeur: 10_000, nombre: 2 },
            { valeur: 500, nombre: 3 },
          ],
          pieces: 750,
          total: 22_250,
        },
        session,
      ),
    },
    {
      nom: "caisse.cloturee",
      schema: c.EVENEMENT_CAISSE_CLOTUREE.schema,
      lire: lireCloture,
      valide: enveloppe(
        "caisse.cloturee",
        { sessionId: "s1", cashCompte: 24_500, cashAttendu: 25_000, ecart: -500, auto: false },
        session,
      ),
    },
  ];

  for (const { nom, schema, lire, valide } of cas) {
    describe(nom, () => {
      const accepte = (v: unknown) => {
        try {
          lire(v);
          return true;
        } catch {
          return false;
        }
      };

      it("accepte ce que le contrat accepte (événement valide)", () => {
        expect(schema.safeParse(valide).success).toBe(true);
        expect(accepte(valide)).toBe(true);
      });

      it("refuse tout ce que le contrat refuse, champ par champ", () => {
        const divergences: string[] = [];
        let refuses = 0;
        for (const { nom: variante, valeur } of variantes(valide)) {
          const zod = schema.safeParse(valeur).success;
          const lecteur = accepte(valeur);
          if (!zod) refuses += 1;
          if (zod !== lecteur) divergences.push(`${variante} : contrat ${zod}, lecteur ${lecteur}`);
        }
        expect(refuses).toBeGreaterThan(30);
        expect(divergences).toEqual([]);
      });

      it("même verdict sur les identifiants et les heures", () => {
        for (const id of UUID_ESSAIS) {
          const e = { ...valide, id };
          expect(accepte(e), `id ${id}`).toBe(schema.safeParse(e).success);
        }
        for (const at of ISO_ESSAIS) {
          const e = { ...valide, at };
          expect(accepte(e), `at ${at}`).toBe(schema.safeParse(e).success);
        }
        for (const type of [
          "session",
          "billet",
          "colis",
          "depart",
          "appareil",
          "personne",
          "demande",
          "controle",
          "autre",
        ]) {
          const e = { ...valide, cible: { type, id: "x" } };
          expect(accepte(e), `cible ${type}`).toBe(schema.safeParse(e).success);
        }
      });

      it("refuse un autre type d'événement et un numéro de plage", () => {
        expect(accepte({ ...valide, type: "caisse.validee" })).toBe(false);
        expect(accepte({ ...valide, numeroPlage: 12 })).toBe(false);
        expect(schema.safeParse({ ...valide, numeroPlage: 12 }).success).toBe(false);
      });
    });
  }

  it("la cible déduite des données est celle du contrat", () => {
    const donnees = { sessionId: "s9", numero: "n", guichetId: "g", fondDeCaisse: 0 };
    expect(c.EVENEMENT_CAISSE_OUVERTE.cible(donnees)).toEqual({ type: "session", id: "s9" });
    const evt = { ...cas[0]!.valide, donnees };
    expect(lireOuverture(evt).cible).toEqual({ type: "session", id: "s9" });
  });
});

function essayer<T>(f: () => T): { ok: T } | { erreur: string } {
  try {
    return { ok: f() };
  } catch (e) {
    return { erreur: e instanceof Error ? e.name : "inconnue" };
  }
}
