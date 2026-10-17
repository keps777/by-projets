import { beforeEach, describe, expect, it } from "vitest";
import { JOUR, monterCovoiturage, type MontageCovoiturage } from "./testing/montage";

const DEMAIN = "2027-01-06"; // le test commence le mardi 5 janvier 2027

describe("demandes de passagers", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  const demande = (extra = {}) => ({
    depart: "douala",
    arrivee: "Kribi",
    jour: DEMAIN,
    moment: "matin" as const,
    places: 1,
    ...extra,
  });

  it("le passager dépose une demande ; elle est lue avec les noms officiels des villes", async () => {
    const p = m.voyageur("Alice Mballa");
    const d = await m.services.demandes.creer(p, demande());
    expect(d).toMatchObject({
      depart: "Douala",
      arrivee: "Kribi",
      jour: DEMAIN,
      moment: "matin",
      quand: "mercredi matin",
      statut: "ouverte",
      propositions: [],
    });
    expect(await m.services.demandes.duPassager(p)).toHaveLength(1);
  });

  it("refuse un jour passé, trop lointain, ou deux fois la même ville", async () => {
    const p = m.voyageur("Alice Mballa");
    await expect(
      m.services.demandes.creer(p, demande({ jour: "2027-01-04" })),
    ).rejects.toMatchObject({
      code: "JOUR_PASSE",
    });
    await expect(
      m.services.demandes.creer(p, demande({ jour: "2027-04-01" })),
    ).rejects.toMatchObject({
      code: "JOUR_TROP_LOIN",
    });
    await expect(
      m.services.demandes.creer(p, demande({ arrivee: "DOUALA" })),
    ).rejects.toMatchObject({
      code: "VILLES_IDENTIQUES",
    });
  });

  it("trois demandes ouvertes au plus", async () => {
    const p = m.voyageur("Alice Mballa");
    for (let i = 0; i < 3; i += 1) await m.services.demandes.creer(p, demande());
    await expect(m.services.demandes.creer(p, demande())).rejects.toMatchObject({
      status: 409,
      code: "TROP_DE_DEMANDES",
    });
    const [premiere] = await m.services.demandes.duPassager(p);
    await m.services.demandes.annuler(p, premiere!.id);
    await expect(m.services.demandes.creer(p, demande())).resolves.toBeDefined();
  });

  it("annuler : seul le passager, et rejouer ne change rien", async () => {
    const p = m.voyageur("Alice Mballa");
    const d = await m.services.demandes.creer(p, demande());
    await expect(m.services.demandes.annuler(m.voyageur("Intrus"), d.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await m.services.demandes.annuler(p, d.id)).statut).toBe("annulee");
    expect((await m.services.demandes.annuler(p, d.id)).statut).toBe("annulee");
    expect(await m.services.demandes.duPassager(p)).toHaveLength(0);
  });

  it("le conducteur voit les demandes auxquelles son trajet répond, pas les autres", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication({ places: 2 }));
    const alice = m.voyageur("Alice Mballa");
    const bertrand = m.voyageur("Bertrand Nji");
    const chantal = m.voyageur("Chantal Eto");
    const dora = m.voyageur("Dora Fouda");
    await m.services.demandes.creer(alice, demande());
    await m.services.demandes.creer(bertrand, demande({ moment: "soir" })); // pas le bon moment
    await m.services.demandes.creer(chantal, demande({ places: 3 })); // trop de places
    await m.services.demandes.creer(dora, demande({ arrivee: "Yaoundé" })); // pas la même route

    const vues = await m.services.demandes.pourConducteur(c.id);
    expect(vues).toEqual([
      {
        id: expect.any(String),
        passager: "Alice M.",
        depart: "Douala",
        arrivee: "Kribi",
        quand: "mercredi matin",
        places: 1,
        trajetPropose: t.id,
        heurePropose: "08:30",
      },
    ]);
  });

  it("un conducteur ne voit pas sa propre demande", async () => {
    const c = await m.conducteur();
    await m.services.trajets.publier(c, m.publication());
    await m.services.demandes.creer(c, demande());
    expect(await m.services.demandes.pourConducteur(c.id)).toEqual([]);
  });

  it("proposer : SMS au passager, une seule fois même si on rejoue ; la demande n'est plus montrée", async () => {
    const c = await m.conducteur("Samuel Ekambi");
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const d = await m.services.demandes.creer(p, demande());

    await m.services.demandes.proposer(c, d.id, t.id);
    await m.services.demandes.proposer(c, d.id, t.id);
    expect(m.ports.notifieur.pour(p.id)).toEqual([
      "AfriMove covoiturage : Samuel te propose le trajet Douala - Kribi, mer. 06/01 à 08:30, à 4 000 F la place. Ouvre l'app pour réserver.",
    ]);
    expect(await m.services.demandes.pourConducteur(c.id)).toEqual([]);
    const [vue] = await m.services.demandes.duPassager(p);
    expect(vue?.propositions).toEqual([
      {
        trajetId: t.id,
        conducteur: "Samuel E.",
        departA: expect.any(String),
        prixParPlace: 4000,
        placesLibres: 2,
      },
    ]);
  });

  it("proposer un trajet qui ne convient pas, ou celui d'un autre : refusé", async () => {
    const c = await m.conducteur("Samuel Ekambi", "+237677003001");
    const autre = await m.conducteur("Autre Conducteur", "+237677003002");
    const mien = await m.services.trajets.publier(c, m.publication({ places: 1 }));
    const tard = await m.services.trajets.publier(
      autre,
      m.publication({ departA: new Date(Date.parse("2027-01-06T20:00:00+01:00")).toISOString() }),
    );
    const p = m.voyageur("Alice Mballa");
    const d = await m.services.demandes.creer(p, demande({ places: 2 }));
    await expect(m.services.demandes.proposer(c, d.id, mien.id)).rejects.toMatchObject({
      status: 409,
      code: "TRAJET_INCOMPATIBLE",
    });
    await expect(m.services.demandes.proposer(c, d.id, tard.id)).rejects.toMatchObject({
      status: 404,
      code: "TRAJET_INCONNU",
    });
    await expect(m.services.demandes.proposer(c, "inconnue", mien.id)).rejects.toMatchObject({
      code: "DEMANDE_INCONNUE",
    });
    expect(m.ports.notifieur.pour(p.id)).toEqual([]);
  });

  it("le passager réserve le trajet proposé et paie : sa demande est satisfaite", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const d = await m.services.demandes.creer(p, demande());
    await m.services.demandes.proposer(c, d.id, t.id);
    const commande = await m.services.reservations.reserver(p, t.id, 1);
    expect((await m.ports.demandes.trouver(d.id))?.statut).toBe("ouverte"); // pas encore payé
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
    expect((await m.ports.demandes.trouver(d.id))?.statut).toBe("satisfaite");
  });

  it("une demande dont le jour est passé est close par le balayage", async () => {
    const p = m.voyageur("Alice Mballa");
    const d = await m.services.demandes.creer(p, demande());
    m.avancer(JOUR);
    expect(await m.services.demandes.expirer()).toBe(0); // c'est encore le jour demandé
    m.avancer(JOUR);
    expect(await m.services.demandes.expirer()).toBe(1);
    expect((await m.ports.demandes.trouver(d.id))?.statut).toBe("expiree");
  });
});
