import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  AUTRE_COMPAGNIE,
  AUTRE_GARE,
  COMPAGNIE,
  GARE,
  creerAppNumerotationTest,
  type AppNumerotationTest,
} from "./testing/app-numerotation-test";
import { uuid } from "./testing/montage";

let t: AppNumerotationTest;
let superviseur: { id: string; jeton: string };
let patron: { id: string; jeton: string };
let guichetier: { id: string; jeton: string };

beforeAll(async () => {
  t = await creerAppNumerotationTest();
  superviseur = await t.compte("superviseur");
  patron = await t.compte("patron", { gareId: null });
  guichetier = await t.compte("guichetier");
});
afterAll(() => t.fermer());
// Chaque test repart sans plage attribuée : les rangs du plan se recouvrent d'un test à l'autre.
afterEach(async () => {
  for (const a of await t.plages.lister()) await t.plages.liberer(a.appareilId);
});

const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });

const attribuer = (jeton: string, appareilId: string, corps: unknown) =>
  t
    .http()
    .put(`/numerotation/appareils/${appareilId}/plage`)
    .set(avec(jeton))
    .send(corps as object);

let compteur = 0;
const appareil = () => `appareil-e2e-${++compteur}`;

async function vendre(appareilId: string, numeros: number[], jour = "270105") {
  for (const numeroPlage of numeros) {
    await t.controleNumeros.enregistrer({
      appareilId,
      jour,
      genre: "billet",
      numeroPlage,
      evenementId: uuid(),
      plage: null,
    });
  }
}

describe("accès aux routes", () => {
  it("sans jeton : 401 ; voyageur : 403 ; guichetier ne peut ni attribuer, ni contrôler", async () => {
    expect((await t.http().get("/numerotation/appareils/x/plage")).status).toBe(401);
    const voyageur = await t.compte("voyageur", { gareId: null });
    expect(
      (await t.http().get("/numerotation/appareils/x/plage").set(avec(voyageur.jeton))).status,
    ).toBe(403);
    expect(
      (await attribuer(guichetier.jeton, appareil(), { genre: "guichet", rang: 1 })).status,
    ).toBe(403);
    expect(
      (await t.http().post("/numerotation/controles").set(avec(guichetier.jeton)).send({})).status,
    ).toBe(403);
    expect((await t.http().get("/numerotation/alertes").set(avec(guichetier.jeton))).status).toBe(
      403,
    );
    expect((await t.http().get("/numerotation/compteurs").set(avec(guichetier.jeton))).status).toBe(
      403,
    );
    expect(
      (await t.http().delete("/numerotation/appareils/x/plage").set(avec(guichetier.jeton))).status,
    ).toBe(403);
  });
});

describe("attribuer, lire, libérer une plage", () => {
  it("le superviseur attribue la plage du guichet 2 dans sa gare, et l'audit s'en souvient", async () => {
    const id = appareil();
    const rep = await attribuer(superviseur.jeton, id, {
      genre: "guichet",
      rang: 2,
      titulaire: { id: guichetier.id, nom: "Marie Ngono" },
    });
    expect(rep.status).toBe(200);
    expect(rep.body).toMatchObject({
      appareilId: id,
      genre: "guichet",
      rang: 2,
      plage: { debut: 1001, fin: 1999 },
      gareId: GARE,
      compagnieId: COMPAGNIE,
      titulaire: { id: guichetier.id, nom: "Marie Ngono" },
      attribueePar: superviseur.id,
      libereeA: null,
    });
    const ligne = t.auditRepo.lignes.find(
      (l) => l.action === "numerotation.plage_attribuee" && l.cibleId === id,
    );
    expect(ligne).toBeDefined();
    expect(ligne!.acteurId).toBe(superviseur.id);
  });

  it("le guichet lit sa plage, son compteur du jour et « plage sans trou »", async () => {
    const id = appareil();
    await attribuer(superviseur.jeton, id, { genre: "guichet", rang: 1 });
    await vendre(id, [1, 2, 3]);
    let rep = await t
      .http()
      .get(`/numerotation/appareils/${id}/plage?jour=270105`)
      .set(avec(guichetier.jeton));
    expect(rep.status).toBe(200);
    expect(rep.body).toMatchObject({
      appareilId: id,
      jour: "270105",
      plage: { debut: 1, fin: 999 },
      plageSansTrou: true,
      billets: { emis: 3, dernier: 3, prochain: 4, restants: 996, trous: [] },
      colis: { emis: 0, prochain: 1 },
    });
    await vendre(id, [5]);
    rep = await t
      .http()
      .get(`/numerotation/appareils/${id}/plage?jour=270105`)
      .set(avec(guichetier.jeton));
    expect(rep.body.plageSansTrou).toBe(false);
    expect(rep.body.billets.trous).toEqual([4]);
  });

  it("sans jour, c'est le jour de Douala du serveur", async () => {
    const id = appareil();
    await attribuer(superviseur.jeton, id, { genre: "guichet", rang: 1 });
    const rep = await t
      .http()
      .get(`/numerotation/appareils/${id}/plage`)
      .set(avec(superviseur.jeton));
    expect(rep.body.jour).toBe("270105"); // 21 h à Douala le 5 janvier 2027
  });

  it("un appareil sans plage : 404 ; un appareil d'une autre gare : 403", async () => {
    expect(
      (await t.http().get("/numerotation/appareils/inconnu/plage").set(avec(superviseur.jeton)))
        .status,
    ).toBe(404);
    const id = appareil();
    await attribuer(superviseur.jeton, id, { genre: "guichet", rang: 3 });
    const autre = await t.compte("guichetier", { gareId: AUTRE_GARE });
    expect(
      (await t.http().get(`/numerotation/appareils/${id}/plage`).set(avec(autre.jeton))).status,
    ).toBe(403);
    const autreCompagnie = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
    expect(
      (await t.http().get(`/numerotation/appareils/${id}/plage`).set(avec(autreCompagnie.jeton)))
        .status,
    ).toBe(403);
    expect(
      (await t.http().get(`/numerotation/appareils/${id}/plage`).set(avec(patron.jeton))).status,
    ).toBe(200);
  });

  it("une plage qui en recouvre une autre : 409 qui nomme l'appareil en conflit", async () => {
    const premier = appareil();
    await attribuer(superviseur.jeton, premier, { genre: "convoyeur", rang: 1, nbConvoyeurs: 1 });
    const rep = await attribuer(superviseur.jeton, appareil(), {
      genre: "convoyeur",
      plage: { debut: 3500, fin: 3600 },
    });
    expect(rep.status).toBe(409);
    expect(rep.body).toMatchObject({ code: "PLAGE_CHEVAUCHANTE", appareilEnConflit: premier });
  });

  it("demandes invalides : 400 avec un code lisible", async () => {
    const cas: [unknown, string][] = [
      [{ genre: "chauffeur", rang: 1 }, "REQUETE_INVALIDE"],
      [{}, "REQUETE_INVALIDE"],
      [{ genre: "guichet", rang: "deux" }, "REQUETE_INVALIDE"],
      [{ genre: "guichet", plage: { debut: "a", fin: 3 } }, "REQUETE_INVALIDE"],
      [{ genre: "guichet", rang: 1, titulaire: { id: "x" } }, "REQUETE_INVALIDE"],
      [{ genre: "guichet", rang: 4 }, "PLAGE_INVALIDE"],
      [{ genre: "guichet" }, "PLAGE_INVALIDE"],
      [{ genre: "guichet", plage: { debut: 4001, fin: 4100 } }, "PLAGE_INVALIDE"],
      [{ genre: "convoyeur", rang: 1 }, "PLAGE_INVALIDE"],
    ];
    for (const [corps, code] of cas) {
      const rep = await attribuer(superviseur.jeton, appareil(), corps);
      expect(rep.status, JSON.stringify(corps)).toBe(400);
      expect(rep.body.code, JSON.stringify(corps)).toBe(code);
    }
    expect(
      (await t.http().get("/numerotation/appareils/x/plage?jour=2701").set(avec(superviseur.jeton)))
        .status,
    ).toBe(400);
    expect(
      (
        await t
          .http()
          .get("/numerotation/appareils/x/plage?jour=271305")
          .set(avec(superviseur.jeton))
      ).status,
    ).toBe(400);
  });

  it("le superviseur reste dans sa gare ; le patron doit nommer la gare", async () => {
    expect(
      (
        await attribuer(superviseur.jeton, appareil(), {
          genre: "guichet",
          rang: 1,
          gareId: AUTRE_GARE,
        })
      ).status,
    ).toBe(403);
    const sansGare = await attribuer(patron.jeton, appareil(), { genre: "guichet", rang: 1 });
    expect(sansGare.status).toBe(400);
    const id = appareil();
    const rep = await attribuer(patron.jeton, id, {
      genre: "guichet",
      rang: 1,
      gareId: AUTRE_GARE,
    });
    expect(rep.status).toBe(200);
    expect(rep.body).toMatchObject({ gareId: AUTRE_GARE, compagnieId: COMPAGNIE });
    // le superviseur de GARE ne peut pas libérer ni lire un appareil de l'autre gare
    expect(
      (await t.http().delete(`/numerotation/appareils/${id}/plage`).set(avec(superviseur.jeton)))
        .status,
    ).toBe(403);
  });

  it("libérer : 204, puis la plage n'existe plus (404) et peut être reprise", async () => {
    const id = appareil();
    await attribuer(superviseur.jeton, id, { genre: "guichet", rang: 3 });
    expect(
      (await t.http().delete(`/numerotation/appareils/${id}/plage`).set(avec(superviseur.jeton)))
        .status,
    ).toBe(204);
    expect(
      (await t.http().get(`/numerotation/appareils/${id}/plage`).set(avec(superviseur.jeton)))
        .status,
    ).toBe(404);
    expect(
      (await t.http().delete(`/numerotation/appareils/${id}/plage`).set(avec(superviseur.jeton)))
        .status,
    ).toBe(404);
    expect(
      (await attribuer(superviseur.jeton, appareil(), { genre: "guichet", rang: 3 })).status,
    ).toBe(200);
    expect(
      t.auditRepo.lignes.some((l) => l.action === "numerotation.plage_liberee" && l.cibleId === id),
    ).toBe(true);
  });
});

describe("contrôle, alertes et compteurs (rapport du soir)", () => {
  it("un trou : le contrôle crée une alerte nominative que le superviseur et le patron lisent", async () => {
    const id = appareil();
    await attribuer(superviseur.jeton, id, {
      genre: "guichet",
      rang: 2,
      titulaire: { id: guichetier.id, nom: "Marie Ngono" },
    });
    await vendre(id, [1001, 1002, 1005], "270110");

    // rien avant le contrôle
    const avant = await t
      .http()
      .get("/numerotation/alertes?jour=270110")
      .set(avec(superviseur.jeton));
    expect(avant.body).toEqual([]);

    const rep = await t
      .http()
      .post("/numerotation/controles")
      .set(avec(superviseur.jeton))
      .send({ jour: "270110" });
    expect(rep.status).toBe(200);
    expect(rep.body).toHaveLength(1);
    expect(rep.body[0]).toMatchObject({
      type: "trou_dans_la_plage",
      gravite: "alerte",
      appareilId: id,
      auteurId: guichetier.id,
      gareId: GARE,
      details: {
        jour: "270110",
        numerosManquants: [1003, 1004],
        titulaire: { nom: "Marie Ngono" },
        message: "Il manque les numéros 1003–1004 (billets) dans la plage 1001–1999 de Marie Ngono",
      },
    });

    for (const jeton of [superviseur.jeton, patron.jeton]) {
      const lues = await t.http().get("/numerotation/alertes?jour=270110").set(avec(jeton));
      expect(lues.status).toBe(200);
      expect(lues.body.map((a: { appareilId: string }) => a.appareilId)).toEqual([id]);
    }
    // une autre gare, une autre compagnie : rien
    const autreSup = await t.compte("superviseur", { gareId: AUTRE_GARE });
    expect(
      (await t.http().get("/numerotation/alertes?jour=270110").set(avec(autreSup.jeton))).body,
    ).toEqual([]);
    const autrePatron = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
    expect(
      (await t.http().get("/numerotation/alertes?jour=270110").set(avec(autrePatron.jeton))).body,
    ).toEqual([]);

    // la synchronisation tardive comble le trou, le contrôle referme l'alerte
    await vendre(id, [1003, 1004], "270110");
    const apres = await t
      .http()
      .post("/numerotation/controles")
      .set(avec(superviseur.jeton))
      .send({ jour: "270110" });
    expect(apres.body).toEqual([]);
    expect(t.auditRepo.lignes.some((l) => l.action === "numerotation.controle")).toBe(true);
  });

  it("le contrôle sans jour prend aujourd'hui ; un jour mal formé : 400", async () => {
    expect(
      (await t.http().post("/numerotation/controles").set(avec(superviseur.jeton)).send({})).status,
    ).toBe(200);
    expect(
      (
        await t
          .http()
          .post("/numerotation/controles")
          .set(avec(superviseur.jeton))
          .send({ jour: "hier" })
      ).status,
    ).toBe(400);
  });

  it("le compteur de la gare : un résumé par appareil et les totaux du jour", async () => {
    const a = appareil();
    const b = appareil();
    await attribuer(superviseur.jeton, a, { genre: "guichet", rang: 1 });
    await attribuer(superviseur.jeton, b, { genre: "guichet", rang: 2 });
    await vendre(a, [1, 2], "270120");
    await vendre(b, [1001], "270120");
    const rep = await t
      .http()
      .get("/numerotation/compteurs?jour=270120")
      .set(avec(superviseur.jeton));
    expect(rep.status).toBe(200);
    const ids = rep.body.appareils.map((x: { appareilId: string }) => x.appareilId);
    expect(ids).toEqual(expect.arrayContaining([a, b]));
    expect(rep.body.totaux.billets).toBe(3 + 0);
    expect(rep.body.enLigne).toEqual({ billets: 0, colis: 0 });

    // le patron voit la compagnie, et peut restreindre à une gare
    const compagnie = await t
      .http()
      .get("/numerotation/compteurs?jour=270120")
      .set(avec(patron.jeton));
    expect(compagnie.status).toBe(200);
    const filtree = await t
      .http()
      .get(`/numerotation/compteurs?jour=270120&gareId=${AUTRE_GARE}`)
      .set(avec(patron.jeton));
    expect(filtree.body.appareils.every((x: { gareId: string }) => x.gareId === AUTRE_GARE)).toBe(
      true,
    );
    // un superviseur ne peut pas demander une autre gare
    expect(
      (
        await t
          .http()
          .get(`/numerotation/compteurs?gareId=${AUTRE_GARE}`)
          .set(avec(superviseur.jeton))
      ).status,
    ).toBe(403);
  });

  it("un compte sans gare (superviseur) ou sans compagnie (patron) ne voit rien : jamais « tout »", async () => {
    const sansGare = await t.compte("superviseur", { gareId: null });
    expect((await t.http().get("/numerotation/alertes").set(avec(sansGare.jeton))).status).toBe(
      403,
    );
    const sansCompagnie = await t.compte("patron", { compagnieId: null, gareId: null });
    expect(
      (await t.http().get("/numerotation/alertes").set(avec(sansCompagnie.jeton))).status,
    ).toBe(403);
    expect(
      (
        await attribuer(sansCompagnie.jeton, appareil(), {
          genre: "guichet",
          rang: 1,
          gareId: GARE,
        })
      ).status,
    ).toBe(403);
  });
});
