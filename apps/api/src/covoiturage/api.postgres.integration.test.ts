import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { MINUTE } from "./testing/montage";
import { creerAppCovoiturageEnBase, type AppCovoiturageEnBase } from "./testing/app-covoiturage-pg";

/**
 * L'API complète du covoiturage sur PostgreSQL (`API_STOCKAGE=postgres`) : publication d'un trajet par un
 * conducteur vérifié, recherche, réservation, paiement par webhook, arrivée, versement au conducteur,
 * puis redémarrage de l'API : rien n'est perdu.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · covoiturage, l'API de bout en bout", () => {
  let base: BaseDeTest;
  let t: AppCovoiturageEnBase;
  let compteurFichiers = 0;

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    t = await creerAppCovoiturageEnBase({ url: base.url });
  }, 120_000);

  afterAll(async () => {
    await t?.fermer();
    await base?.fermer();
  });

  const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
  const get = (chemin: string, jeton: string) => t.http().get(chemin).set(avec(jeton));
  const post = (chemin: string, jeton: string, corps: object = {}) =>
    t.http().post(chemin).set(avec(jeton)).send(corps);
  const put = (chemin: string, jeton: string, corps: object) =>
    t.http().put(chemin).set(avec(jeton)).send(corps);
  const racine = "/voyageur/covoit/conducteur";

  async function verifierConducteur(
    c: { id: string; jeton: string },
    afrimove: { jeton: string },
  ): Promise<void> {
    const v = await put(`${racine}/verification/vehicule`, c.jeton, {
      marque: "Toyota",
      modele: "Corolla",
      couleur: "grise",
      immatriculation: "LT 882 CE",
      places: 3,
      grandBagage: false,
    });
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    const pieces: [string, object][] = [
      ["identite", { numero: "123456789" }],
      ["permis", { numero: "CM-445566", expireLe: "2031-06-30" }],
      ["carte_grise", { numero: "CG-778899" }],
      ["voiture", {}],
    ];
    for (const [type, extra] of pieces) {
      compteurFichiers += 1;
      const d = await put(`${racine}/verification/pieces/${type}`, c.jeton, {
        fichierId: `fichier:${compteurFichiers}`,
        ...extra,
      });
      expect(d.status, JSON.stringify(d.body)).toBe(200);
      const r = await put(`/covoiturage/verifications/${c.id}/pieces/${type}`, afrimove.jeton, {
        decision: "validee",
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
  }

  it("de la vérification du conducteur à l'argent versé, puis après un redémarrage", async () => {
    const afrimove = await t.compte("afrimove");
    const conducteur = await t.compte("voyageur", {
      nom: "Samuel Ekambi",
      telephone: "+237677112233",
    });
    const passager = await t.compte("voyageur", { nom: "Alice Mballa" });

    // Sans dossier vérifié, rien ne se publie ; avec, le trajet est écrit en base.
    const trajetBrut = {
      depart: { ville: "Douala", point: "Bonapriso, pharmacie du Rond-point" },
      arrivee: { ville: "Kribi", point: "Kribi centre" },
      departA: t.dans(24 * 60),
      places: 2,
      prixParPlace: 4000,
      options: ["clim"],
    };
    const refus = await post(`${racine}/trajets`, conducteur.jeton, trajetBrut);
    expect(refus.status).toBe(403);
    await verifierConducteur(conducteur, afrimove);
    const publie = await post(`${racine}/trajets`, conducteur.jeton, trajetBrut);
    expect(publie.status, JSON.stringify(publie.body)).toBe(201);
    const trajetId = (publie.body as { id: string }).id;

    // La recherche lit les trajets en base (et le référentiel : Douala ↔ Kribi a un conseil de prix).
    const recherche = await get("/voyageur/covoit?depart=Douala&arrivee=Kribi", passager.jeton);
    expect(recherche.status, JSON.stringify(recherche.body)).toBe(200);
    const offre = (
      recherche.body as { offres: { id: string; placesLibres: number }[] }
    ).offres.find((o) => o.id === trajetId);
    expect(offre).toMatchObject({ placesLibres: 2 });

    // Réservation puis paiement par le webhook de l'agrégateur.
    const reservation = await post(`/voyageur/covoit/${trajetId}/reservations`, passager.jeton, {
      places: 2,
    });
    expect(reservation.status, JSON.stringify(reservation.body)).toBe(201);
    const commandeId = (reservation.body as { id: string }).id;
    // Les deux dernières places sont prises : un autre passager est refusé.
    const autre = await t.compte("voyageur", { nom: "Paul Ngono" });
    const complet = await post(`/voyageur/covoit/${trajetId}/reservations`, autre.jeton, {
      places: 1,
    });
    expect(complet.status).toBe(409);
    expect(complet.body).toMatchObject({ code: "PLUS_ASSEZ_DE_PLACES" });

    const paiement = await post(`/voyageur/commandes/${commandeId}/paiements`, passager.jeton, {
      moyen: "mtn_momo",
    });
    expect(paiement.status, JSON.stringify(paiement.body)).toBe(201);
    const notif = t.agregateur.notificationDeReussite((paiement.body as { id: string }).id);
    const webhook = await t
      .http()
      .post("/paiements/webhooks/simule")
      .set(notif.entetes as Record<string, string>)
      .send(notif.corpsBrut ?? "");
    expect(webhook.status, JSON.stringify(webhook.body)).toBe(200);
    expect(
      (await get(`/voyageur/covoit/reservations/${commandeId}`, passager.jeton)).body,
    ).toMatchObject({
      statut: "payee",
      places: 2,
    });
    expect(t.passerelle.envois).toHaveLength(0);

    // Le trajet a lieu : le passager confirme son arrivée, le conducteur est payé une seule fois.
    t.horloge.avancer(24 * 60 * MINUTE + 1);
    const arrivee = await post(
      `/voyageur/covoit/reservations/${commandeId}/arrivee`,
      passager.jeton,
    );
    expect(arrivee.status, JSON.stringify(arrivee.body)).toBe(200);
    expect(arrivee.body).toMatchObject({ statut: "terminee" });
    await post(`/voyageur/covoit/reservations/${commandeId}/arrivee`, passager.jeton);
    expect(t.passerelle.envois).toEqual([
      {
        cle: `covoiturage:${commandeId}`,
        montant: 8000,
        telephone: "+237677112233",
        reservationId: commandeId,
      },
    ]);

    // Ce qui est en base.
    const lignes = await t.prisma.reservationCovoiturage.findMany({ where: { id: commandeId } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ statut: "terminee", places: 2, trajetId });
    expect(
      await t.prisma.versementCovoiturage.count({ where: { reservationId: commandeId } }),
    ).toBe(1);
    expect(await t.prisma.pieceConducteur.count({ where: { conducteurId: conducteur.id } })).toBe(
      4,
    );
    const piece = await t.prisma.pieceConducteur.findUniqueOrThrow({
      where: { conducteurId_type: { conducteurId: conducteur.id, type: "identite" } },
    });
    expect(piece.numeroChiffre).toMatch(/^enc:v1:/);
    expect(piece.numeroChiffre).not.toContain("123456789");

    // Redémarrage : une nouvelle instance relit tout dans la base.
    const jetons = { conducteur: conducteur.jeton, passager: passager.jeton };
    await t.fermer();
    t = await creerAppCovoiturageEnBase({
      url: base.url,
      debut: new Date("2027-01-06T08:00:00.000Z"),
    });
    const relue = await get(`/voyageur/covoit/reservations/${commandeId}`, jetons.passager);
    expect(relue.status, JSON.stringify(relue.body)).toBe(200);
    expect(relue.body).toMatchObject({ statut: "terminee", places: 2 });
    const mes = await get(racine, jetons.conducteur);
    expect(mes.status, JSON.stringify(mes.body)).toBe(200);
    expect(JSON.stringify(mes.body)).toContain(trajetId);
  }, 120_000);
});
