import { describe, expect, it } from "vitest";
import {
  BilletEnDeuxFoisRegleSchema,
  OffreFinancementSchema,
  ReglerBilletEnDeuxFoisSchema,
} from "./financement";

describe("financement : ajouts compatibles", () => {
  const offre = {
    partenaire: null,
    conventionSignee: false,
    avance: {
      statut: "en_cours",
      plafond: 12_000_000,
      equivalentJoursDeVentes: 10,
      montantPropose: 6_000_000,
      conditions: { remboursementPctVentesMomo: 8, dureeEstimeeSemaines: 7, coutTotalPct: null },
      versementSousHeures: 24,
    },
    creditMateriel: { description: "x", montantTotal: 1, mensualites: 1, montantMensualite: 1 },
    paie: { nbSalaires: 3, jourDeVersement: "vendredi" },
    billetEnDeuxFois: {
      actif: false,
      exemple: { prixBillet: 7500, reservation: 4000, veille: 3500 },
    },
  };
  const signature = { pin: "483920", methode: "pin", signeA: "2027-01-05T14:07:00.000+01:00" };

  it("avance.dossierId est facultatif (une offre sans lui reste valide) mais doit être un numéro de dossier", () => {
    expect(OffreFinancementSchema.safeParse(offre).success).toBe(true);
    const avec = (dossierId: string) => ({ ...offre, avance: { ...offre.avance, dossierId } });
    expect(OffreFinancementSchema.safeParse(avec("AV-2027-0042")).success).toBe(true);
    expect(OffreFinancementSchema.safeParse(avec("dossier-42")).success).toBe(false);
  });

  it("régler le paiement en 2 fois exige un booléen et une signature", () => {
    expect(ReglerBilletEnDeuxFoisSchema.safeParse({ actif: false, signature }).success).toBe(true);
    expect(ReglerBilletEnDeuxFoisSchema.safeParse({ actif: "oui", signature }).success).toBe(false);
    expect(ReglerBilletEnDeuxFoisSchema.safeParse({ actif: true }).success).toBe(false);
  });

  it("l'accusé reprend le journal de l'écriture signée et l'état obtenu", () => {
    const accuse = { journalId: "j1", signeA: signature.signeA, signePar: "u1", actif: true };
    expect(BilletEnDeuxFoisRegleSchema.safeParse(accuse).success).toBe(true);
    expect(BilletEnDeuxFoisRegleSchema.safeParse({ ...accuse, actif: undefined }).success).toBe(
      false,
    );
  });
});
