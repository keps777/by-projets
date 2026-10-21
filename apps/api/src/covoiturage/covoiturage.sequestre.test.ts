import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  avec,
  creerAppCovoiturageTest,
  COMPTE_SEQUESTRE,
  type AppCovoiturageTest,
} from "./testing/app-covoiturage-test";
import { ReservationsService } from "./reservations.service";
import { TrajetsService } from "./trajets.service";
import { VerificationService } from "./verification.service";

/**
 * Sans compte de séquestre chez l'agrégateur, une réservation ne peut pas être payée : c'est la
 * première chose que l'intégration doit configurer (README, « Intégration »).
 */
describe("compte de séquestre", () => {
  let t: AppCovoiturageTest;
  let afrimove: { id: string; jeton: string };

  beforeAll(async () => {
    t = await creerAppCovoiturageTest({ sansSequestre: true });
    afrimove = await t.compte("afrimove");
  });
  afterAll(async () => t.fermer());

  async function reservationAPayer() {
    const verification = t.app.get(VerificationService);
    const conducteur = await t.compte("voyageur", { nom: "Samuel Ekambi" });
    await verification.declarerVehicule(conducteur.id, {
      marque: "Toyota",
      modele: "Corolla",
      couleur: "grise",
      immatriculation: "LT 882 CE",
      places: 3,
      grandBagage: false,
    });
    for (const type of ["identite", "permis", "carte_grise", "voiture"] as const) {
      await verification.deposerPiece(conducteur.id, type, {
        fichierId: `fichier:${type}`,
        ...(type === "voiture" ? {} : { numero: "123456" }),
        ...(type === "permis" ? { expireLe: "2031-01-01" } : {}),
      });
      await verification.decider(
        { id: afrimove.id, role: "afrimove", compagnieId: null, gareId: null },
        conducteur.id,
        type,
        "validee",
        undefined,
      );
    }
    const trajet = await t.app.get(TrajetsService).publier(
      { id: conducteur.id, role: "voyageur", compagnieId: null, gareId: null },
      {
        depart: { ville: "Douala", point: "Bonapriso" },
        arrivee: { ville: "Kribi", point: "Centre" },
        departA: t.dans(24 * 60),
        places: 2,
        prixParPlace: 4000,
        options: [],
      },
    );
    const passager = await t.compte("voyageur", { nom: "Alice Mballa" });
    const commande = await t.app
      .get(ReservationsService)
      .reserver(
        { id: passager.id, role: "voyageur", compagnieId: null, gareId: null },
        trajet.id,
        1,
      );
    return { passager, commande };
  }

  it("payer une réservation est refusé (422 COMPAGNIE_SANS_COMPTE), rien n'est débité", async () => {
    const { passager, commande } = await reservationAPayer();
    const r = await t
      .http()
      .post(`/voyageur/commandes/${commande.id}/paiements`)
      .set(avec(passager.jeton))
      .send({ moyen: "mtn_momo" });
    expect(r.status, JSON.stringify(r.body)).toBe(422);
    expect(r.body).toMatchObject({ code: "COMPAGNIE_SANS_COMPTE" });
  });

  it("le compte donné par COVOITURAGE_COMPTE_SEQUESTRE est enregistré chez les paiements au démarrage", async () => {
    const avecCompte = await creerAppCovoiturageTest();
    try {
      expect(avecCompte.covoiturage.config.compteSequestre).toBe(COMPTE_SEQUESTRE);
      expect(
        await avecCompte.comptesReversement.compte(
          avecCompte.covoiturage.config.compagnieSequestreId,
        ),
      ).toBe(COMPTE_SEQUESTRE);
    } finally {
      await avecCompte.fermer();
    }
  });
});
