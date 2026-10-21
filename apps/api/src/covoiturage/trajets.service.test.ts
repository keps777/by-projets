import { beforeEach, describe, expect, it } from "vitest";
import { JOUR, dans, monterCovoiturage, type MontageCovoiturage } from "./testing/montage";

const DEPART = 24 * 60 + 30;

describe("publier un trajet", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  it("un conducteur vérifié publie : le trajet est enregistré avec sa voiture et son prix", async () => {
    const c = await m.conducteur();
    const vue = await m.services.trajets.publier(c, m.publication());
    expect(vue).toMatchObject({
      depart: "Douala",
      arrivee: "Kribi",
      places: 2,
      prixParPlace: 4000,
    });
    const t = await m.ports.trajets.trouver(vue.id);
    expect(t).toMatchObject({
      type: "entre_villes",
      conducteurId: c.id,
      vehicule: "Toyota Corolla grise",
      immatriculation: "LT 882 CE",
      dureeMinutes: 150,
      statut: "publie",
    });
  });

  it("un conducteur non vérifié ne peut pas publier, et rien n'est enregistré", async () => {
    const c = m.voyageur("Paul Nkoulou");
    await expect(m.services.trajets.publier(c, m.publication())).rejects.toMatchObject({
      status: 403,
      code: "CONDUCTEUR_NON_VERIFIE",
    });
    expect(await m.ports.trajets.duConducteur(c.id)).toHaveLength(0);
  });

  it("le prix reste un partage de frais : pas au-dessus du conseil, pas en dessous de 100 F", async () => {
    const c = await m.conducteur();
    await expect(
      m.services.trajets.publier(c, m.publication({ prixParPlace: 4600 })),
    ).rejects.toMatchObject({
      status: 422,
      code: "PRIX_INVALIDE",
      response: { details: { max: 4500 } },
    });
    await expect(
      m.services.trajets.publier(c, m.publication({ prixParPlace: 50 })),
    ).rejects.toMatchObject({ code: "PRIX_INVALIDE" });
    await expect(
      m.services.trajets.publier(c, m.publication({ prixParPlace: 4500 })),
    ).resolves.toBeDefined();
  });

  it("un trajet sans conseil connu est plafonné à 20 000 F ; en ville, 1 000 F", async () => {
    const c = await m.conducteur();
    const yde = {
      depart: { ville: "Douala", point: "Akwa" },
      arrivee: { ville: "Yaoundé", point: "Mvan" },
    };
    await expect(
      m.services.trajets.publier(c, m.publication({ ...yde, prixParPlace: 20_001 })),
    ).rejects.toMatchObject({ code: "PRIX_INVALIDE" });
    await expect(
      m.services.trajets.publier(c, m.publication({ ...yde, prixParPlace: 6000 })),
    ).resolves.toMatchObject({ arrivee: "Yaoundé" });
    const ville = {
      depart: { ville: "Douala", point: "Akwa" },
      arrivee: { ville: "douala", point: "Bonanjo" },
    };
    await expect(
      m.services.trajets.publier(
        c,
        m.publication({ ...ville, departA: dans(3 * 24 * 60), prixParPlace: 1200 }),
      ),
    ).rejects.toMatchObject({ code: "PRIX_INVALIDE" });
    const enVille = await m.services.trajets.publier(
      c,
      m.publication({ ...ville, departA: dans(3 * 24 * 60), prixParPlace: 700 }),
    );
    expect((await m.ports.trajets.trouver(enVille.id))?.type).toBe("ville");
  });

  it("pas plus de places que la voiture n'en offre", async () => {
    const c = await m.conducteur();
    await expect(m.services.trajets.publier(c, m.publication({ places: 4 }))).rejects.toMatchObject(
      {
        status: 422,
        code: "PLACES_AU_DELA_DU_VEHICULE",
        response: { details: { placesVehicule: 3 } },
      },
    );
  });

  it("le départ doit être à plus de 30 minutes et à moins de 60 jours", async () => {
    const c = await m.conducteur();
    await expect(
      m.services.trajets.publier(c, m.publication({ departA: dans(20) })),
    ).rejects.toMatchObject({ code: "DEPART_TROP_PROCHE" });
    await expect(
      m.services.trajets.publier(c, m.publication({ departA: dans(61 * 24 * 60) })),
    ).rejects.toMatchObject({ code: "DEPART_TROP_LOIN" });
    await expect(
      m.services.trajets.publier(c, m.publication({ departA: dans(40) })),
    ).resolves.toBeDefined();
  });

  it("refuse une option inconnue", async () => {
    const c = await m.conducteur();
    await expect(
      m.services.trajets.publier(c, m.publication({ options: ["clim", "jacuzzi"] })),
    ).rejects.toMatchObject({ code: "OPTION_INCONNUE" });
  });

  it("deux trajets qui se chevauchent : refusé ; l'un après l'autre : accepté", async () => {
    const c = await m.conducteur();
    await m.services.trajets.publier(c, m.publication());
    await expect(
      m.services.trajets.publier(c, m.publication({ departA: dans(DEPART + 60) })),
    ).rejects.toMatchObject({ status: 409, code: "TRAJET_CHEVAUCHANT" });
    await expect(
      m.services.trajets.publier(c, m.publication({ departA: dans(DEPART + 150) })),
    ).resolves.toBeDefined();
  });

  it("deux publications simultanées du même créneau : une seule passe", async () => {
    const c = await m.conducteur();
    const issues = await Promise.allSettled([
      m.services.trajets.publier(c, m.publication()),
      m.services.trajets.publier(c, m.publication()),
      m.services.trajets.publier(c, m.publication()),
    ]);
    expect(issues.filter((i) => i.status === "fulfilled")).toHaveLength(1);
    expect(await m.ports.trajets.duConducteur(c.id)).toHaveLength(1);
  });

  it("un trajet régulier est marqué comme tel, l'option « regulier » aussi", async () => {
    const c = await m.conducteur();
    const a = await m.services.trajets.publier(c, m.publication({ regulier: true }));
    const t = await m.ports.trajets.trouver(a.id);
    expect(t).toMatchObject({ regulier: true });
    expect(t?.options).toContain("regulier");
  });

  it("l'écriture est tracée dans le journal d'audit", async () => {
    const c = await m.conducteur();
    const a = await m.services.trajets.publier(c, m.publication());
    const lignes = await m.audit.lister({ limite: 200 });
    expect(lignes.find((l) => l.action === "covoiturage.trajet_publie")).toMatchObject({
      acteurId: c.id,
      cibleId: a.id,
    });
  });
});

describe("formulaire de publication", () => {
  it("premier trajet : formulaire vide, demain 08:00, conseil absent tant qu'on n'a pas de villes", async () => {
    const m = monterCovoiturage();
    const c = await m.conducteur();
    const f = await m.services.trajets.formulaire(c);
    expect(f).toMatchObject({
      vehicule: "Toyota Corolla grise",
      immatriculation: "LT 882 CE",
      depart: { ville: "", point: "" },
      places: { choix: [1, 2, 3], choisi: 2 },
      fraisParPlace: 250,
      reputation: { trajets: 0, note: 0 },
    });
    expect(f.departA).toBe(dans(24 * 60));
    expect(f.options.map((o) => o.code)).toEqual(["clim", "bagage_moyen", "femmes", "regulier"]);
    expect(f.options.every((o) => !o.actif)).toBe(true);
    expect(f.conducteur.verifie).toBe(true);
  });

  it("reprend le dernier trajet, une semaine plus tard, avec le prix conseillé", async () => {
    const m = monterCovoiturage();
    const c = await m.conducteur();
    await m.services.trajets.publier(
      c,
      m.publication({ options: ["clim", "femmes"], places: 3, prixParPlace: 4200 }),
    );
    const f = await m.services.trajets.formulaire(c);
    expect(f).toMatchObject({
      depart: { ville: "Douala", point: "Bonapriso, pharmacie du Rond-point" },
      arrivee: { ville: "Kribi" },
      places: { choisi: 3 },
      prixParPlace: 4200,
      prixConseille: { min: 3500, max: 4500 },
    });
    expect(new Date(f.departA).getTime() - new Date(dans(DEPART)).getTime()).toBe(0); // départ à venir : gardé
    expect(f.options.filter((o) => o.actif).map((o) => o.code)).toEqual(["clim", "femmes"]);
  });

  it("un conducteur sans dossier voit un formulaire, marqué non vérifié", async () => {
    const m = monterCovoiturage();
    const c = m.voyageur("Paul Nkoulou");
    const f = await m.services.trajets.formulaire(c);
    expect(f.conducteur.verifie).toBe(false);
    expect(f.vehicule).toBe("");
    expect(f.places.choix).toEqual([1, 2, 3]);
  });
});

describe("fin et renouvellement des trajets", () => {
  let m: MontageCovoiturage;
  beforeEach(() => {
    m = monterCovoiturage();
  });

  it("un trajet est fermé quand son arrivée prévue est passée, pas avant", async () => {
    const c = await m.conducteur();
    const a = await m.services.trajets.publier(c, m.publication());
    m.allerA(DEPART + 149);
    expect(await m.services.trajets.terminer()).toBe(0);
    m.allerA(DEPART + 151);
    expect(await m.services.trajets.terminer()).toBe(1);
    expect((await m.ports.trajets.trouver(a.id))?.statut).toBe("termine");
    expect(await m.services.trajets.terminer()).toBe(0);
  });

  it("un trajet régulier est republié la semaine suivante, une seule fois, à la même heure", async () => {
    const c = await m.conducteur();
    const a = await m.services.trajets.publier(c, m.publication({ regulier: true }));
    m.allerA(DEPART + 10);
    expect(await m.services.trajets.renouveler()).toBe(1);
    expect(await m.services.trajets.renouveler()).toBe(0); // rien de plus au second passage
    const tous = await m.ports.trajets.duConducteur(c.id, { statuts: ["publie"] });
    const suivant = tous.find((t) => t.id !== a.id);
    expect(suivant).toBeDefined();
    expect(
      suivant!.departA.getTime() - (await m.ports.trajets.trouver(a.id))!.departA.getTime(),
    ).toBe(7 * JOUR);
    expect(suivant).toMatchObject({
      regulier: true,
      places: 2,
      prixParPlace: 4000,
      statut: "publie",
    });
  });

  it("deux balayages simultanés ne republient qu'une fois", async () => {
    const c = await m.conducteur();
    await m.services.trajets.publier(c, m.publication({ regulier: true }));
    m.allerA(DEPART + 10);
    const [x, y] = await Promise.all([
      m.services.trajets.renouveler(),
      m.services.trajets.renouveler(),
    ]);
    expect(x + y).toBe(1);
  });

  it("la série s'arrête si le conducteur n'est plus vérifié", async () => {
    const c = await m.conducteur();
    await m.services.trajets.publier(c, m.publication({ regulier: true }));
    await m.services.verification.deposerPiece(c.id, "voiture", { fichierId: "autre" });
    m.allerA(DEPART + 10);
    expect(await m.services.trajets.renouveler()).toBe(0);
  });

  it("un trajet non régulier, ou une série annulée, n'est pas republié", async () => {
    const c = await m.conducteur();
    const a = await m.services.trajets.publier(c, m.publication());
    const b = await m.services.trajets.publier(
      c,
      m.publication({ regulier: true, departA: dans(2 * 24 * 60) }),
    );
    await m.services.reservations.annulerTrajet(c, b.id, { serie: true });
    m.allerA(3 * 24 * 60);
    expect(await m.services.trajets.renouveler()).toBe(0);
    expect(a.id).not.toBe(b.id);
  });

  it("si le balayage a manqué des semaines, on republie la première semaine à venir", async () => {
    const c = await m.conducteur();
    const a = await m.services.trajets.publier(c, m.publication({ regulier: true }));
    m.allerA(DEPART + 20 * 24 * 60);
    await m.services.trajets.renouveler();
    const suivant = (await m.ports.trajets.duConducteur(c.id, { statuts: ["publie"] })).find(
      (t) => t.id !== a.id,
    )!;
    expect(suivant.departA.getTime()).toBeGreaterThan(m.horloge.maintenant().getTime());
    expect(suivant.departA.getTime() - m.horloge.maintenant().getTime()).toBeLessThanOrEqual(
      7 * JOUR,
    );
    expect(
      (suivant.departA.getTime() - (await m.ports.trajets.trouver(a.id))!.departA.getTime()) %
        (7 * JOUR),
    ).toBe(0);
  });
});
