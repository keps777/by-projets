import { beforeEach, describe, expect, it } from "vitest";
import { MINUTE, dans, monterCovoiturage, type MontageCovoiturage } from "./testing/montage";

const DEPART = 24 * 60 + 30;
const ville = (depart: string, arrivee: string, extra = {}) => ({
  depart: { ville: depart, point: `${depart} gare` },
  arrivee: { ville: arrivee, point: `${arrivee} centre` },
  ...extra,
});

describe("recherche entre villes", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  it("trouve le trajet, avec le conducteur vérifié, la voiture, les places et l'arrivée estimée", async () => {
    const c = await m.conducteur("Samuel Ekambi");
    await m.services.trajets.publier(c, m.publication({ options: ["clim"] }));
    const p = m.voyageur("Alice Mballa");
    const res = await m.services.recherche.rechercher(p, { depart: "douala", arrivee: "KRIBI" });
    expect(res).toMatchObject({ ville: "Douala", depart: "Douala", arrivee: "Kribi" });
    expect(res.offres).toHaveLength(1);
    expect(res.offres[0]).toMatchObject({
      vehicule: "Toyota Corolla grise",
      clim: true,
      femmesBienvenues: false,
      placesLibres: 2,
      prixParPlace: 4000,
      departA: dans(DEPART),
      arriveeEstimee: dans(DEPART + 150),
      dureeMinutes: 150,
      conducteur: { nom: "Samuel E.", verifie: true },
    });
  });

  it("accepte les villes sans accent ni majuscule, et le code de la ville", async () => {
    const c = await m.conducteur();
    await m.services.trajets.publier(
      c,
      m.publication(ville("Douala", "Yaoundé", { prixParPlace: 5000 })),
    );
    const p = m.voyageur("Alice Mballa");
    expect(
      (await m.services.recherche.rechercher(p, { depart: "DLA", arrivee: "yaounde" })).offres,
    ).toHaveLength(1);
    expect(
      (await m.services.recherche.rechercher(p, { depart: "Kribi", arrivee: "Douala" })).offres,
    ).toHaveLength(0);
  });

  it("un conducteur dont le dossier n'est plus valable disparaît des résultats", async () => {
    const c = await m.conducteur();
    await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    expect(
      (await m.services.recherche.rechercher(p, { depart: "Douala", arrivee: "Kribi" })).offres,
    ).toHaveLength(1);
    await m.services.verification.deposerPiece(c.id, "identite", {
      fichierId: "nouvelle",
      numero: "99",
    });
    expect(
      (await m.services.recherche.rechercher(p, { depart: "Douala", arrivee: "Kribi" })).offres,
    ).toHaveLength(0);
  });

  it("un trajet complet, annulé ou à moins de 30 minutes du départ n'est pas proposé", async () => {
    const c1 = await m.conducteur("Conducteur Un", "+237677003001");
    const c2 = await m.conducteur("Conducteur Deux", "+237677003002");
    const c3 = await m.conducteur("Conducteur Trois", "+237677003003");
    const complet = await m.services.trajets.publier(c1, m.publication({ places: 1 }));
    const annule = await m.services.trajets.publier(c2, m.publication());
    await m.services.trajets.publier(c3, m.publication({ departA: dans(60) }));
    const preneur = m.voyageur("Preneur");
    const commande = await m.services.reservations.reserver(preneur, complet.id, 1);
    await m.services.reservations.confirmerPaiement(commande.id, "mtn_momo");
    await m.services.reservations.annulerTrajet(c2, annule.id);

    const p = m.voyageur("Alice Mballa");
    const avant = await m.services.recherche.rechercher(p, { depart: "Douala", arrivee: "Kribi" });
    expect(avant.offres).toHaveLength(1); // seul le trajet de c3, à 1 h
    m.allerA(40); // il part dans 20 minutes : fermé
    const apres = await m.services.recherche.rechercher(p, { depart: "Douala", arrivee: "Kribi" });
    expect(apres.offres).toHaveLength(0);
  });

  it("les places retenues par un autre passager sont décomptées, puis rendues à l'expiration", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    await m.services.reservations.reserver(m.voyageur("Bertrand Nji"), t.id, 1);
    const p = m.voyageur("Alice Mballa");
    const libres = async () =>
      (await m.services.recherche.rechercher(p, { depart: "Douala", arrivee: "Kribi" })).offres[0]
        ?.placesLibres;
    expect(await libres()).toBe(1);
    m.avancer(16 * MINUTE);
    expect(await libres()).toBe(2);
  });

  it("on ne voit pas son propre trajet", async () => {
    const c = await m.conducteur();
    await m.services.trajets.publier(c, m.publication());
    expect(
      (await m.services.recherche.rechercher(c, { depart: "Douala", arrivee: "Kribi" })).offres,
    ).toHaveLength(0);
  });

  it("filtres : climatisation, femmes bienvenues, grand bagage, prix maximum", async () => {
    const a = await m.conducteur("Conducteur A", "+237677003001");
    const b = await m.conducteur("Conducteur B", "+237677003002");
    await m.services.trajets.publier(
      a,
      m.publication({ options: ["clim", "femmes"], prixParPlace: 3600 }),
    );
    await m.services.trajets.publier(b, m.publication({ options: [], prixParPlace: 4400 }));
    const p = m.voyageur("Alice Mballa");
    const cherche = (q: object) =>
      m.services.recherche.rechercher(p, { depart: "Douala", arrivee: "Kribi", ...q });
    expect((await cherche({})).offres).toHaveLength(2);
    expect((await cherche({ filtres: ["clim"] })).offres.map((o) => o.prixParPlace)).toEqual([
      3600,
    ]);
    expect((await cherche({ filtres: ["femmes"] })).offres).toHaveLength(1);
    expect((await cherche({ filtres: ["grand_bagage"] })).offres).toHaveLength(0);
    expect((await cherche({ prixMax: 4000 })).offres.map((o) => o.prixParPlace)).toEqual([3600]);
    expect((await cherche({ filtres: ["clim", "femmes"], prixMax: 3000 })).offres).toHaveLength(0);
  });

  it("à partir de : ne propose pas les départs plus tôt", async () => {
    const c = await m.conducteur();
    await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    const apres = await m.services.recherche.rechercher(p, {
      depart: "Douala",
      arrivee: "Kribi",
      apartirDe: dans(DEPART + 10),
    });
    expect(apres.offres).toHaveLength(0);
    const avant = await m.services.recherche.rechercher(p, {
      depart: "Douala",
      arrivee: "Kribi",
      apartirDe: dans(DEPART - 10),
    });
    expect(avant.offres).toHaveLength(1);
  });

  it("compte les vues des trajets que le voyageur a consultés (une par voyageur)", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    await m.services.recherche.rechercher(p, { depart: "Douala", arrivee: "Kribi" });
    await m.services.recherche.rechercher(p, { depart: "Douala", arrivee: "Kribi" });
    await m.services.recherche.rechercher(m.voyageur("Bertrand Nji"), {
      depart: "Douala",
      arrivee: "Kribi",
    });
    expect(await m.ports.trajets.nombreVues(t.id)).toBe(2);
  });

  it("l'accueil : les covoiturages du jour, au format des départs", async () => {
    const c = await m.conducteur();
    const t = await m.services.trajets.publier(c, m.publication());
    const p = m.voyageur("Alice Mballa");
    expect(
      await m.services.recherche.pourListe(p.id, {
        depart: "Douala",
        arrivee: "Kribi",
        jour: "2027-01-06",
      }),
    ).toEqual([
      {
        id: t.id,
        heureDepart: dans(DEPART),
        conducteur: "Samuel E.",
        verifie: true,
        lieuDepart: "Bonapriso, pharmacie du Rond-point",
        placesLibres: 2,
        vehicule: "Toyota Corolla grise",
        prixParPlace: 4000,
      },
    ]);
    expect(
      await m.services.recherche.pourListe(p.id, {
        depart: "Douala",
        arrivee: "Kribi",
        jour: "2027-01-07",
      }),
    ).toEqual([]);
  });
});

describe("recherche en ville", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  const enVille = (point1: string, point2: string, minutes: number, extra = {}) =>
    m.publication({
      depart: { ville: "Douala", point: point1 },
      arrivee: { ville: "Douala", point: point2 },
      departA: dans(minutes),
      prixParPlace: 500,
      ...extra,
    });

  it("« maintenant » : les départs de l'heure qui vient, pas ceux de demain ni ceux d'une autre ville", async () => {
    const c1 = await m.conducteur("Conducteur Un", "+237677003001");
    const c2 = await m.conducteur("Conducteur Deux", "+237677003002");
    const c3 = await m.conducteur("Conducteur Trois", "+237677003003");
    await m.services.trajets.publier(c1, enVille("Akwa", "Bonanjo", 45));
    await m.services.trajets.publier(c2, enVille("Akwa", "Bonanjo", 24 * 60));
    await m.services.trajets.publier(c3, {
      ...enVille("Bastos", "Mvan", 45),
      depart: { ville: "Yaoundé", point: "Bastos" },
      arrivee: { ville: "Yaoundé", point: "Mvan" },
    });
    const p = m.voyageur("Alice Mballa");
    const res = await m.services.recherche.enVille(p, { ville: "douala", quand: "maintenant" });
    expect(res.ville).toEqual({ nom: "Douala", detectee: false });
    expect(res.quand).toBe("maintenant");
    expect(res.offres).toHaveLength(1);
    expect(res.offres[0]).toMatchObject({
      type: "covoiturage",
      qui: "Conducteur U.",
      verifie: true,
      prix: 500,
      departDansMinutes: 45,
      placesLibres: 2,
    });
    expect(res.offres[0]?.detail).toContain("Akwa → Bonanjo");
  });

  it("les trajets qui passent par les lieux demandés viennent en premier", async () => {
    const a = await m.conducteur("Conducteur A", "+237677003001");
    const b = await m.conducteur("Conducteur B", "+237677003002");
    await m.services.trajets.publier(a, enVille("Deido", "Bali", 30));
    await m.services.trajets.publier(b, enVille("Akwa Nord", "Bonanjo", 50));
    const p = m.voyageur("Alice Mballa");
    const res = await m.services.recherche.enVille(p, {
      ville: "Douala",
      depart: "akwa",
      arrivee: "bonanjo",
    });
    expect(res.offres.map((o) => o.prix)).toHaveLength(2);
    expect(res.offres[0]?.detail).toContain("Akwa Nord");
  });

  it("« chaque matin » : les trajets réguliers qui partent le matin, dans les 24 prochaines heures", async () => {
    // il est 08:00 : 06:30 demain est dans 22 h 30, 13:00 aujourd'hui dans 5 h
    const c1 = await m.conducteur("Conducteur Un", "+237677003001");
    const c2 = await m.conducteur("Conducteur Deux", "+237677003002");
    const c3 = await m.conducteur("Conducteur Trois", "+237677003003");
    const matin = await m.services.trajets.publier(
      c1,
      enVille("Akwa", "Bonanjo", 22 * 60 + 30, { regulier: true }),
    );
    await m.services.trajets.publier(c2, enVille("Akwa", "Bonanjo", 5 * 60, { regulier: true })); // 13:00
    await m.services.trajets.publier(c3, enVille("Akwa", "Bonanjo", 22 * 60 + 30)); // pas régulier
    const res = await m.services.recherche.enVille(m.voyageur("Alice Mballa"), {
      ville: "Douala",
      quand: "chaque_matin",
    });
    expect(res.offres.map((o) => o.id)).toEqual([matin.id]);
  });

  it("si le voyageur ne cherche que d'autres types d'offre, aucun covoiturage", async () => {
    const c = await m.conducteur();
    await m.services.trajets.publier(c, enVille("Akwa", "Bonanjo", 45));
    const res = await m.services.recherche.enVille(m.voyageur("Alice Mballa"), {
      ville: "Douala",
      types: ["moto"],
    });
    expect(res.offres).toEqual([]);
  });

  it("rend le trajet régulier du voyageur avec l'écran", async () => {
    const p = m.voyageur("Alice Mballa");
    await m.services.regulier.creer(p, {
      ville: "Douala",
      depart: "Akwa",
      arrivee: "Bonanjo",
      departA: "07:30",
    });
    const res = await m.services.recherche.enVille(p, { ville: "Douala" });
    expect(res.trajetDuMatin).toMatchObject({ actif: true, departA: "07:30" });
  });
});
