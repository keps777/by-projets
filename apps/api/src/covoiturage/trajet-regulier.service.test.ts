import { describe, expect, it } from "vitest";
import { dans, monterCovoiturage } from "./testing/montage";

describe("trajet régulier du passager (en ville)", () => {
  it("sans trajet régulier : 404", async () => {
    const m = monterCovoiturage();
    const p = m.voyageur("Alice Mballa");
    await expect(m.services.regulier.obtenir(p)).rejects.toMatchObject({
      status: 404,
      code: "TRAJET_REGULIER_INCONNU",
    });
    await expect(m.services.regulier.definir(p, false)).rejects.toMatchObject({ status: 404 });
  });

  it("créer, désactiver, réactiver, remplacer : un seul trajet par voyageur", async () => {
    const m = monterCovoiturage();
    const p = m.voyageur("Alice Mballa");
    const cree = await m.services.regulier.creer(p, {
      ville: "douala",
      depart: "Akwa",
      arrivee: "Bonanjo",
      departA: "07:30",
    });
    expect(cree).toMatchObject({ actif: true, departA: "07:30" });
    expect(cree.libelle).toBe("Mon trajet du matin · Akwa → Bonanjo · 07:30");
    // le rappel part 20 minutes avant l'heure habituelle
    expect(cree.explication).toBe(
      "Chaque jour ouvré, l'app te propose à 07:10 les voitures qui partent.",
    );

    expect((await m.services.regulier.definir(p, false)).actif).toBe(false);
    expect((await m.services.regulier.obtenir(p)).actif).toBe(false);
    expect((await m.services.regulier.definir(p, true)).actif).toBe(true);

    const remplace = await m.services.regulier.creer(p, {
      ville: "Douala",
      depart: "Deido",
      arrivee: "Bali",
      departA: "17:45",
    });
    expect(remplace.libelle).toBe("Mon trajet régulier · Deido → Bali · 17:45");
    expect((await m.services.regulier.obtenir(p)).departA).toBe("17:45");
  });

  it("départ et arrivée identiques : refusé ; un autre voyageur a son propre trajet", async () => {
    const m = monterCovoiturage();
    const p = m.voyageur("Alice Mballa");
    await expect(
      m.services.regulier.creer(p, {
        ville: "Douala",
        depart: "Akwa",
        arrivee: " akwa ",
        departA: "07:30",
      }),
    ).rejects.toMatchObject({ status: 422, code: "LIEUX_IDENTIQUES" });
    await m.services.regulier.creer(p, {
      ville: "Douala",
      depart: "Akwa",
      arrivee: "Bonanjo",
      departA: "07:30",
    });
    await expect(m.services.regulier.obtenir(m.voyageur("Bertrand Nji"))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("nomme le conducteur habituel après deux trajets en ville avec lui", async () => {
    const m = monterCovoiturage();
    const c = await m.conducteur("Samuel Ekambi");
    const p = m.voyageur("Alice Mballa");
    await m.services.regulier.creer(p, {
      ville: "Douala",
      depart: "Akwa",
      arrivee: "Bonanjo",
      departA: "07:30",
    });
    expect((await m.services.regulier.obtenir(p)).explication).not.toContain("Samuel");

    for (const jour of [1, 2]) {
      const t = await m.services.trajets.publier(
        c,
        m.publication({
          depart: { ville: "Douala", point: "Akwa" },
          arrivee: { ville: "Douala", point: "Bonanjo" },
          departA: dans(jour * 24 * 60),
          prixParPlace: 500,
        }),
      );
      const commande = await m.services.reservations.reserver(p, t.id, 1);
      await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
      m.allerA(jour * 24 * 60 + 60);
      await m.services.reservations.confirmerArrivee(p, commande.id);
    }
    expect((await m.services.regulier.obtenir(p)).explication).toContain("Samuel");
  });
});
