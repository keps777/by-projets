import { describe, expect, it } from "vitest";
import { SchemaConvention } from "../colis/inter-agences";
import { ConventionSchema, InterAgencesSchema } from "./interAgences";

describe("inter-agences : ajouts compatibles", () => {
  const colisEnCorrespondance = {
    colisId: "colis-0088",
    numero: "C-DLA-BAM-270104-0088",
    origine: "Douala",
    destination: "Bamenda",
    poidsKg: 4,
    troncons: [
      {
        rang: 1,
        compagnie: "Alpha",
        origine: "Douala",
        destination: "Bafoussam",
        heureDepart: "08:15",
        bus: "LT-123-AB",
        heureArrivee: "12:00",
        part: 2800,
      },
    ],
    regle: "La responsabilité passe au scan.",
  };
  const base = {
    colisEnCorrespondance,
    reglement: {
      autreCompagnie: "Oméga",
      nousDoit: 19_500,
      nbColisTransportesPourEux: 14,
      nousLeDevons: 7200,
      nbColisEnCorrespondance: 6,
      soldeNet: 12_300,
      reglementA: "2027-01-11T08:00:00.000+01:00",
    },
    correspondanceVoyageurs: { minutesGaranties: 25, attenteDuSecondBusMinutes: 15 },
    conventions: [{ id: "convention-alpha-omega", avec: "Oméga", statut: "active" }],
  };
  const trajet = {
    origine: "Yaoundé",
    via: "Bafoussam",
    destination: "Bamenda",
    premiere: "Alpha",
    seconde: "Oméga",
  };

  it("une planche sans trajet voyageur reste valide (champ ajouté, facultatif)", () => {
    expect(InterAgencesSchema.safeParse(base).success).toBe(true);
  });

  it("le colis en correspondance est facultatif : sans échange en cours, la planche reste valide", () => {
    const { colisEnCorrespondance: _colis, ...sansColis } = base;
    expect(InterAgencesSchema.safeParse(sansColis).success).toBe(true);
    expect(
      InterAgencesSchema.safeParse({ ...sansColis, colisEnCorrespondance: undefined }).success,
    ).toBe(true);
  });

  it("un colis présent doit rester complet : le facultatif ne rend pas ses champs facultatifs", () => {
    const { regle: _regle, ...sansRegle } = colisEnCorrespondance;
    expect(
      InterAgencesSchema.safeParse({ ...base, colisEnCorrespondance: sansRegle }).success,
    ).toBe(false);
  });

  it("l'origine du billet voyageur en correspondance : d'où, par où, vers où, quelle compagnie d'abord", () => {
    const lu = InterAgencesSchema.parse({
      ...base,
      correspondanceVoyageurs: { ...base.correspondanceVoyageurs, trajet },
    });
    expect(lu.correspondanceVoyageurs.trajet).toEqual(trajet);
  });

  it("un trajet voyageur incomplet ou avec un champ inconnu est refusé", () => {
    const avec = (t: unknown) =>
      InterAgencesSchema.safeParse({
        ...base,
        correspondanceVoyageurs: { ...base.correspondanceVoyageurs, trajet: t },
      }).success;
    const { via: _via, ...sansVia } = trajet;
    expect(avec(sansVia)).toBe(false);
    expect(avec({ ...trajet, depart: "08:00" })).toBe(false);
    expect(avec(trajet)).toBe(true);
  });
});

describe("inter-agences : un seul contrat convention", () => {
  it("le contrat patron est celui du module colis, complet (moi, délai de litige, pied)", () => {
    expect(ConventionSchema).toBe(SchemaConvention);
    const champs = Object.keys(ConventionSchema.shape);
    expect(champs).toContain("pied");
    expect(Object.keys(ConventionSchema.shape.trimestre.shape)).toContain("delaiLitigeJours");
  });

  it("l'ancienne forme patron (compagnies, signeeLe, parts à colisType) n'est plus une convention", () => {
    const ancienne = {
      id: "convention-alpha-omega",
      compagnies: ["Alpha", "Oméga"],
      signeeLe: "2026-10-12",
      renouvellement: "trimestriel",
      statut: "active",
      parts: {
        colisType: { poidsKg: 4, prix: 4000, fraisAfriMove: 200 },
        lignes: [],
        total: { premiere: 1, seconde: 1 },
      },
      regles: [],
      signatures: [],
      trimestre: { colisEchanges: 0, litiges: 0, netRecu: 0, reglements: 0 },
    };
    expect(ConventionSchema.safeParse(ancienne).success).toBe(false);
  });
});
