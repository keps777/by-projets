import { describe, expect, it } from "vitest";
import type { DonneesMois } from "./modele";
import {
  COMPTES,
  FRAIS_AGENCE_BILLET,
  FRAIS_AGENCE_COLIS,
  accorder,
  dimanchesDuMois,
  ecartMobile,
  ecritures,
  encaisse,
  facturesHebdo,
  lundiDeLaPremiereFacture,
  modeDeLaVente,
  nombre,
} from "./regles";
import { debutDuMois, debutDuMoisSuivant } from "./temps";
import { annulation, iso, vente } from "./testing/donnees";

function donnees(surcharge: Partial<DonneesMois> = {}): DonneesMois {
  const mois = surcharge.mois ?? "2026-12";
  return {
    compagnieId: "agence",
    mois,
    du: debutDuMois(mois),
    avant: debutDuMoisSuivant(mois),
    ventes: [],
    ventesAvant: [],
    sessions: [],
    annulations: [],
    rapprochement: {
      references: 0,
      rapprochees: 0,
      recuMarchand: 0,
      ventesMobile: { nombre: 0, montant: 0 },
      montantMobileBrut: 0,
      sansCorrespondance: [],
    },
    decisions: [],
    parametres: {
      compagnieId: "agence",
      nomAgence: "Alpha Voyages",
      emailCabinet: null,
      envoiAutomatique: false,
      jourDEnvoi: 2,
      jourDeCloture: 5,
    },
    facturesPayees: new Map(),
    maintenant: iso("2027-01-05", "09:12:00"),
    ...surcharge,
  };
}

describe("mise en forme", () => {
  it("sépare les milliers par une espace simple, comme les maquettes", () => {
    expect(nombre(31_404)).toBe("31 404");
    expect(nombre(28_414_000)).toBe("28 414 000");
    expect(nombre(0)).toBe("0");
    expect(nombre(-1000)).toBe("-1 000");
  });

  it("accorde au pluriel à partir de deux", () => {
    expect(accorder(1, "ligne")).toBe("1 ligne");
    expect(accorder(0, "ligne")).toBe("0 ligne");
    expect(accorder(142, "ligne")).toBe("142 lignes");
  });
});

describe("total encaissé", () => {
  it("additionne les ventes qui tiennent, par moyen de paiement ; une vente annulée ne compte pas", () => {
    const e = encaisse([
      vente({ prix: 5000, moyen: "cash" }),
      vente({ prix: 3500, moyen: "cash" }),
      vente({ prix: 7500, moyen: "mtn" }),
      vente({ prix: 4000, moyen: "orange" }),
      vente({ prix: 9000, moyen: "carte" }),
      vente({ prix: 5000, moyen: "cash", annuleeA: iso("2026-12-02") }),
    ]);
    expect(e).toEqual({ total: 29_000, cash: 8500, momo: 11_500, carte: 9000 });
    expect(e.cash + e.momo + e.carte).toBe(e.total);
  });

  it("une vente annulée porte « ANNULÉ » dans la colonne mode, les autres leur moyen", () => {
    expect(modeDeLaVente(vente({ moyen: "cash" }))).toBe("CASH");
    expect(modeDeLaVente(vente({ moyen: "mtn" }))).toBe("MOMO");
    expect(modeDeLaVente(vente({ moyen: "orange" }))).toBe("ORANGE");
    expect(modeDeLaVente(vente({ moyen: "carte" }))).toBe("CARTE");
    expect(modeDeLaVente(vente({ moyen: "mtn", annuleeA: iso("2026-12-02") }))).toBe("ANNULÉ");
  });

  it("l'écart MoMo est le reçu moins le brut enregistré, moins ce que les décisions ont traité", () => {
    const base = {
      references: 0,
      rapprochees: 0,
      ventesMobile: { nombre: 0, montant: 0 },
      sansCorrespondance: [],
    };
    // 16 000 F reçus sans vente : l'écart tombe à zéro quand les quatre lignes sont traitées.
    expect(ecartMobile({ ...base, recuMarchand: 7_664_000, montantMobileBrut: 7_648_000 }, 0)).toBe(
      16_000,
    );
    expect(
      ecartMobile({ ...base, recuMarchand: 7_664_000, montantMobileBrut: 7_648_000 }, 16_000),
    ).toBe(0);
    // Plus de ventes enregistrées que d'argent reçu : écart négatif.
    expect(ecartMobile({ ...base, recuMarchand: 100, montantMobileBrut: 1100 }, 0)).toBe(-1000);
  });
});

describe("factures hebdomadaires d'AfriMove", () => {
  it("les tarifs sont 75 F par billet et 150 F par colis", () => {
    expect(FRAIS_AGENCE_BILLET).toBe(75);
    expect(FRAIS_AGENCE_COLIS).toBe(150);
  });

  it("une facture par dimanche du mois : quatre en décembre 2026", () => {
    expect(dimanchesDuMois("2026-12")).toEqual([
      "2026-12-06",
      "2026-12-13",
      "2026-12-20",
      "2026-12-27",
    ]);
    // Décembre 2026 commence un mardi : la première semaine facturée commence le lundi 30 novembre.
    expect(lundiDeLaPremiereFacture("2026-12")).toBe("2026-11-30");
  });

  it("facture 75 F par billet et 150 F par colis de la semaine, annulés exclus", () => {
    const d = donnees({
      ventesAvant: [vente({ at: iso("2026-11-30", "09:00:00") })], // lundi 30 novembre : 1re semaine
      ventes: [
        vente({ at: iso("2026-12-01", "09:00:00") }),
        vente({ at: iso("2026-12-02", "09:00:00") }),
        vente({ at: iso("2026-12-02", "10:00:00"), annuleeA: iso("2026-12-03", "08:00:00") }),
        vente({ at: iso("2026-12-03", "09:00:00"), genre: "colis" }),
        vente({ at: iso("2026-12-05", "09:00:00"), genre: "colis" }),
        vente({ at: iso("2026-12-08", "09:00:00") }), // 2e semaine
      ],
    });
    const [premiere, deuxieme] = facturesHebdo(d);
    expect(premiere).toMatchObject({
      du: "2026-11-30",
      au: "2026-12-06",
      billets: 3, // 1 le 30/11, 2 en décembre ; le billet annulé n'est pas facturé
      colis: 2,
      montantBillets: 3 * 75,
      montantColis: 2 * 150,
      total: 3 * 75 + 2 * 150,
      payeeLe: null,
    });
    expect(deuxieme).toMatchObject({
      du: "2026-12-07",
      au: "2026-12-13",
      billets: 1,
      colis: 0,
      total: 75,
    });
  });

  it("une annulation postérieure à la fin de la semaine ne défait pas la facture", () => {
    const d = donnees({
      ventes: [
        vente({ at: iso("2026-12-02", "09:00:00"), annuleeA: iso("2026-12-09", "09:00:00") }),
      ],
    });
    expect(facturesHebdo(d)[0]?.billets).toBe(1);
  });

  it("la semaine qui n'est pas finie n'est pas facturée", () => {
    const d = donnees({
      maintenant: iso("2026-12-10", "09:00:00"),
      ventes: [vente({ at: iso("2026-12-08", "09:00:00") })],
    });
    expect(facturesHebdo(d).map((f) => f.au)).toEqual(["2026-12-06"]);
  });

  it("dit si la facture est payée", () => {
    const d = donnees({ facturesPayees: new Map([["2026-12-06", "2026-12-07"]]) });
    const factures = facturesHebdo(d);
    expect(factures[0]?.payeeLe).toBe("2026-12-07");
    expect(factures[1]?.payeeLe).toBeNull();
  });
});

describe("écritures SYSCOHADA", () => {
  it("les comptes sont ceux du ticket : 706, 571, 462, 622", () => {
    expect(COMPTES).toEqual({
      ventes: "706",
      caisse: "571",
      operateurs: "462",
      fraisAfriMove: "622",
    });
  });

  it("une pièce de ventes par jour : débit 571 (espèces) et 462 (mobile), crédit 706", () => {
    const d = donnees({
      ventes: [
        vente({ at: iso("2026-12-01", "08:00:00"), prix: 5000, moyen: "cash" }),
        vente({ at: iso("2026-12-01", "09:00:00"), prix: 3500, moyen: "mtn" }),
        vente({ at: iso("2026-12-01", "10:00:00"), prix: 9000, moyen: "carte" }),
        vente({ at: iso("2026-12-02", "08:00:00"), prix: 7500, moyen: "cash" }),
        vente({
          at: iso("2026-12-02", "09:00:00"),
          prix: 5000,
          moyen: "cash",
          annuleeA: iso("2026-12-02", "12:00:00"),
        }),
      ],
    });
    const ventes = ecritures(d).filter((e) => e.journal === "VE");
    expect(ventes.map((e) => [e.piece, e.compte, e.debit, e.credit])).toEqual([
      ["VE-261201", "571", 5000, 0],
      ["VE-261201", "462", 12_500, 0],
      ["VE-261201", "706", 0, 17_500],
      ["VE-261202", "571", 7500, 0],
      ["VE-261202", "706", 0, 7500],
    ]);
  });

  it("chaque pièce est équilibrée et le total des débits égale celui des crédits", () => {
    const d = donnees({
      maintenant: iso("2027-01-05"),
      ventes: [
        vente({ at: iso("2026-12-01"), prix: 5000, moyen: "cash" }),
        vente({ at: iso("2026-12-02"), prix: 3500, moyen: "orange" }),
        vente({ at: iso("2026-12-08"), prix: 1000, genre: "colis", moyen: "mtn" }),
      ],
      annulations: [
        annulation({ at: iso("2026-12-10"), venteAt: iso("2026-11-20"), montant: 4000 }),
      ],
    });
    const lignes = ecritures(d);
    const parPiece = new Map<string, number>();
    for (const e of lignes)
      parPiece.set(e.piece, (parPiece.get(e.piece) ?? 0) + e.debit - e.credit);
    for (const [piece, solde] of parPiece) expect(solde, piece).toBe(0);
    expect(lignes.reduce((s, e) => s + e.debit, 0)).toBe(lignes.reduce((s, e) => s + e.credit, 0));
  });

  it("le remboursement d'une vente d'un mois clos s'écrit dans le mois du remboursement", () => {
    const d = donnees({
      annulations: [
        annulation({ numero: "A-X", montant: 4000, venteAt: iso("2026-11-20"), moyen: "cash" }),
        annulation({ numero: "A-Y", montant: 2500, venteAt: iso("2026-11-21"), moyen: "mtn" }),
      ],
    });
    const an = ecritures(d).filter((e) => e.journal === "AN");
    expect(an.map((e) => [e.piece, e.compte, e.debit, e.credit])).toEqual([
      ["AN-A-X", "706", 4000, 0],
      ["AN-A-X", "571", 0, 4000],
      ["AN-A-Y", "706", 2500, 0],
      ["AN-A-Y", "462", 0, 2500],
    ]);
  });

  it("une annulation dans le mois de la vente, ou qui n'est pas un remboursement, n'a pas d'écriture", () => {
    const d = donnees({
      annulations: [
        annulation({ venteAt: iso("2026-12-09") }), // même mois : la vente n'est déjà pas comptée
        annulation({ decision: "avoir", venteAt: iso("2026-11-20") }),
        annulation({ decision: "refuser", venteAt: iso("2026-11-20") }),
        annulation({ decision: "reporter", venteAt: iso("2026-11-20") }),
      ],
    });
    expect(ecritures(d).filter((e) => e.journal === "AN")).toEqual([]);
  });

  it("les factures AfriMove s'écrivent le dimanche, débit 622 et crédit 462", () => {
    const d = donnees({
      ventes: [vente({ at: iso("2026-12-02") }), vente({ at: iso("2026-12-03"), genre: "colis" })],
    });
    const fa = ecritures(d).filter((e) => e.journal === "FA");
    expect(fa.map((e) => [e.date, e.piece, e.compte, e.debit, e.credit])).toEqual([
      ["2026-12-06", "FA-261206", "622", 225, 0],
      ["2026-12-06", "FA-261206", "462", 0, 225],
    ]);
  });
});
