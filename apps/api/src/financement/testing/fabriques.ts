import { piecesDuDossier } from "../contenu";
import type { DossierStocke } from "../modele";

/** Un dossier d'avance en analyse, comme la planche FinancementDemande (6 M, envoyé à 10:04). */
export function dossierType(over: Partial<DossierStocke> = {}): DossierStocke {
  return {
    id: "AV-2027-0041",
    version: 1,
    agenceId: "00000000-0000-4000-8000-0000000000c1",
    demandePar: "patron-1",
    montant: 6_000_000,
    statut: "en_analyse",
    partenaire: "Banque Atlantique",
    referencePartenaire: "PART-AV-2027-0041",
    conditions: { remboursementPctVentesMomo: 8, dureeEstimeeSemaines: 7, coutTotalPct: null },
    envoyeA: "2027-01-05T10:04:00.000+01:00",
    reponseAvant: "2027-01-06T10:04:00.000+01:00",
    accuseA: "2027-01-05T10:04:30.000+01:00",
    decisionA: null,
    verseA: null,
    retireA: null,
    motifRefus: null,
    pieces: piecesDuDossier({
      ventes: {
        joursCouverts: 90,
        total: 36_200_000,
        billets: 8940,
        colis: 2310,
        ventesMomo: 20_000_000,
      },
      releve: { mois: 3, correspondancePct: 99.8 },
      pieces: { registreEtCarteValides: true },
      pourcentage: 8,
    }),
    mandat: {
      pourcentage: 8,
      signeA: "2027-01-05T10:04:00.000+01:00",
      signePar: "patron-1",
      compteMarchandId: "marchand-c1",
      operateur: "mtn",
      actif: true,
    },
    resteDu: null,
    rembourseA: null,
    ...over,
  };
}
