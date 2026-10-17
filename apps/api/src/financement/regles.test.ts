import { describe, expect, it } from "vitest";
import type { VentesCertifiees } from "./modele";
import {
  MONTANT_MINIMUM,
  decouperEnDeuxFois,
  dureeEstimeeSemaines,
  estRetirable,
  moisDePaieAutorise,
  moisValide,
  montantPropose,
  numeroDossier,
  partDeLaVente,
  plafondAvance,
  raisonsNonEligible,
  totalARembourser,
  type EntreeEligibilite,
} from "./regles";

const ventes = (over: Partial<VentesCertifiees> = {}): VentesCertifiees => ({
  joursCouverts: 90,
  total: 108_000_000,
  billets: 8940,
  colis: 2310,
  ventesMomo: 100_000_000,
  ...over,
});

const entree = (over: Partial<EntreeEligibilite> = {}): EntreeEligibilite => ({
  conventionSignee: true,
  ventes: ventes(),
  releve: { mois: 3, correspondancePct: 99.8 },
  pieces: { registreEtCarteValides: true },
  ...over,
});

describe("plafond et montant proposé", () => {
  it("le plafond vaut 10 jours de ventes moyens (108 M sur 90 jours : 12 M, comme la maquette)", () => {
    expect(plafondAvance(ventes())).toBe(12_000_000);
  });

  it("arrondit toujours à la tranche inférieure, jamais au-dessus", () => {
    expect(plafondAvance(ventes({ total: 108_899_999 }))).toBe(12_000_000);
    expect(plafondAvance(ventes({ total: 109_000_000 }))).toBe(12_100_000);
    expect(plafondAvance(ventes({ total: 899_999 }))).toBe(0);
  });

  it("propose la moitié du plafond (6 M pour 12 M, comme la maquette)", () => {
    expect(montantPropose(12_000_000)).toBe(6_000_000);
    expect(montantPropose(250_000)).toBe(100_000);
    expect(montantPropose(0)).toBe(0);
  });
});

describe("durée estimée", () => {
  it("divise le montant par ce que 8 % des ventes MoMo rapportent chaque semaine", () => {
    // 100 M de ventes MoMo sur 90 jours : 622 222 F par semaine à 8 % -> 6 M en 10 semaines.
    expect(dureeEstimeeSemaines(6_000_000, 8, 100_000_000)).toBe(10);
  });

  it("arrondit à la semaine supérieure et vaut au moins une semaine", () => {
    expect(dureeEstimeeSemaines(100_000, 8, 100_000_000)).toBe(1);
    expect(dureeEstimeeSemaines(622_223, 8, 100_000_000)).toBe(2);
  });

  it("ne divise jamais par zéro", () => {
    expect(dureeEstimeeSemaines(6_000_000, 8, 0)).toBe(1);
  });
});

describe("éligibilité", () => {
  it("une agence complète est éligible", () => {
    expect(raisonsNonEligible(entree())).toEqual([]);
  });

  it.each([
    ["convention_non_signee", entree({ conventionSignee: false })],
    ["historique_insuffisant", entree({ ventes: ventes({ joursCouverts: 89 }) })],
    ["pas_de_ventes_momo", entree({ ventes: ventes({ ventesMomo: 0 }) })],
    ["rapprochement_insuffisant", entree({ releve: { mois: 3, correspondancePct: 94.9 } })],
    ["pieces_invalides", entree({ pieces: { registreEtCarteValides: false } })],
    ["plafond_insuffisant", entree({ ventes: ventes({ total: 800_000 }) })],
  ] as const)("refuse pour la raison « %s »", (raison, e) => {
    expect(raisonsNonEligible(e)).toContain(raison);
  });

  it("le plafond le plus bas qui passe vaut le montant minimum", () => {
    expect(plafondAvance(ventes({ total: 9 * MONTANT_MINIMUM }))).toBe(MONTANT_MINIMUM);
    expect(raisonsNonEligible(entree({ ventes: ventes({ total: 9 * MONTANT_MINIMUM }) }))).toEqual(
      [],
    );
  });
});

describe("remboursement", () => {
  it("le total dû ajoute le coût du partenaire au montant versé", () => {
    expect(totalARembourser(6_000_000, 5)).toBe(6_300_000);
    expect(totalARembourser(6_000_000, 0)).toBe(6_000_000);
  });

  it("le prélèvement est le pourcentage de la vente, arrondi vers le bas", () => {
    expect(partDeLaVente(10_000, 8)).toBe(800);
    expect(partDeLaVente(7_500, 8)).toBe(600);
    expect(partDeLaVente(12, 8)).toBe(0);
    expect(partDeLaVente(1_999, 8)).toBe(159);
  });
});

describe("paiement du billet en 2 fois", () => {
  it("coupe un billet VIP à 7 500 en 4 000 puis 3 500 (la maquette)", () => {
    expect(decouperEnDeuxFois(7_500)).toEqual({ reservation: 4_000, veille: 3_500 });
  });

  it("les deux parts font toujours le prix du billet", () => {
    for (const prix of [1_000, 1_500, 2_500, 4_300, 7_500, 12_000, 25_000, 33_333]) {
      const plan = decouperEnDeuxFois(prix);
      expect(plan, String(prix)).not.toBeNull();
      expect(plan!.reservation + plan!.veille).toBe(prix);
      expect(plan!.reservation).toBeGreaterThanOrEqual(plan!.veille);
    }
  });

  it("refuse un billet trop petit pour être coupé ou un prix invalide", () => {
    expect(decouperEnDeuxFois(500)).toBeNull();
    expect(decouperEnDeuxFois(0)).toBeNull();
    expect(decouperEnDeuxFois(-7_500)).toBeNull();
    expect(decouperEnDeuxFois(7_500.5)).toBeNull();
  });
});

describe("paie : mois autorisés", () => {
  const maintenant = "2027-01-05T10:00:00.000+01:00";

  it("accepte le mois en cours et le précédent (changement d'année compris)", () => {
    expect(moisDePaieAutorise("2027-01", maintenant)).toBe(true);
    expect(moisDePaieAutorise("2026-12", maintenant)).toBe(true);
  });

  it("refuse un mois futur ou trop ancien", () => {
    expect(moisDePaieAutorise("2027-02", maintenant)).toBe(false);
    expect(moisDePaieAutorise("2026-11", maintenant)).toBe(false);
  });

  it("le mois de minuit à Douala est celui de Douala, pas celui d'UTC", () => {
    // 31 décembre 23:30 UTC = 1er janvier 00:30 à Douala.
    expect(moisDePaieAutorise("2027-01", "2026-12-31T23:30:00.000Z")).toBe(true);
    expect(moisDePaieAutorise("2026-11", "2026-12-31T23:30:00.000Z")).toBe(false);
  });

  it("vérifie la forme du mois", () => {
    expect(moisValide("2027-01")).toBe(true);
    expect(moisValide("2027-13")).toBe(false);
    expect(moisValide("2027-00")).toBe(false);
    expect(moisValide("27-01")).toBe(false);
  });
});

describe("dossier", () => {
  it("n'est retirable que tant que le partenaire n'a pas répondu", () => {
    expect(estRetirable("envoye")).toBe(true);
    expect(estRetirable("en_analyse")).toBe(true);
    expect(estRetirable("verse")).toBe(false);
    expect(estRetirable("refuse")).toBe(false);
    expect(estRetirable("retire")).toBe(false);
  });

  it("numérote AV-AAAA-NNNN", () => {
    expect(numeroDossier(2027, 41)).toBe("AV-2027-0041");
    expect(numeroDossier(2027, 1)).toBe("AV-2027-0001");
  });
});
