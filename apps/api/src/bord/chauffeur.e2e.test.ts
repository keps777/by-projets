import { randomUUID } from "node:crypto";
import { agence } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { versIsoDouala } from "../billetterie/temps";
import {
  DEPART_AUTRE_COMPAGNIE,
  DEPART_AUTRE_EQUIPAGE,
  DEPART_EMBARQUEMENT,
  DEPART_EN_VENTE,
  DEPART_ROUTE,
  avec,
  creerAppBordTest,
  evenement,
  type AppBordTest,
} from "./testing/app-bord-test";

/**
 * La feuille du chauffeur et ses quatre gestes (dépense, incident, retard, arrivée à un arrêt), de bout en
 * bout : HTTP, rôles, événements idempotents, SMS. Chaque réponse est relue avec le schéma de `@afrimove/contrats`.
 */

let t: AppBordTest;
let jeton: string;
let chauffeurId: string;

beforeAll(async () => {
  t = await creerAppBordTest();
  jeton = t.equipage.chauffeur.jeton;
  chauffeurId = t.equipage.chauffeur.id;
});
afterAll(async () => t.fermer());

const poster = (chemin: string, corps: unknown, j = jeton) =>
  t
    .http()
    .post(chemin)
    .set(avec(j))
    .send(corps as object);
const lire = (chemin: string, j = jeton) => t.http().get(chemin).set(avec(j));

const depenseEvt = (
  o: {
    departId?: string;
    id?: string;
    depenseId?: string;
    categorie?: "carburant" | "peage" | "autre";
    montant?: number;
    auteur?: string;
  } = {},
) =>
  evenement(
    agence.EVENEMENT_CHAUFFEUR_DEPENSE,
    o.auteur ?? chauffeurId,
    t.maintenant(),
    {
      depenseId: o.depenseId ?? randomUUID(),
      departId: o.departId ?? DEPART_ROUTE,
      categorie: o.categorie ?? "carburant",
      libelle: "Gasoil, station Total Édéa",
      montant: o.montant ?? 25000,
      justificatifRef: "photo-2026-11-02-0001.jpg",
    },
    { ...(o.id ? { id: o.id } : {}), appareilId: "appareil-bord-2" },
  );

const incidentEvt = (
  o: {
    departId?: string;
    nature?: "panne" | "accident" | "route_coupee" | "autre";
    note?: string | null;
  } = {},
) =>
  evenement(
    agence.EVENEMENT_CHAUFFEUR_INCIDENT,
    chauffeurId,
    t.maintenant(),
    {
      incidentId: randomUUID(),
      departId: o.departId ?? DEPART_ROUTE,
      nature: o.nature ?? "panne",
      gps: { latitude: 3.8, longitude: 10.2, precisionM: 8 },
      note: o.note === undefined ? null : o.note,
    },
    { appareilId: "appareil-bord-2" },
  );

const retardEvt = (o: { departId?: string; minutes?: number } = {}) =>
  evenement(
    agence.EVENEMENT_CHAUFFEUR_RETARD,
    chauffeurId,
    t.maintenant(),
    { departId: o.departId ?? DEPART_ROUTE, minutes: o.minutes ?? 25 },
    { appareilId: "appareil-bord-2" },
  );

const arriveeEvt = (arret: string, departId = DEPART_ROUTE) =>
  evenement(
    agence.EVENEMENT_CHAUFFEUR_ARRIVEE_ARRET,
    chauffeurId,
    t.maintenant(),
    { departId, arret, gps: { latitude: 3.78, longitude: 10.06, precisionM: 10 } },
    { appareilId: "appareil-bord-2" },
  );

describe("GET /agence/bus/chauffeur", () => {
  it("rend la feuille de route du bus en route, conforme au contrat", async () => {
    await t.billetPaye(DEPART_ROUTE, 2, { aBord: true });
    await t.billetPaye(DEPART_ROUTE, 3, { aBord: true });
    await t.billetPaye(DEPART_ROUTE, 4);
    t.colis.definir(DEPART_ROUTE, { charges: 3, colisACharger: 0 });
    const r = await lire("/agence/bus/chauffeur");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const vue = agence.SchemaChauffeurFeuille.parse(r.body);
    expect(vue.chauffeur).toEqual({ id: chauffeurId, nom: "Paul Mbarga" });
    expect(vue.bus.immatriculation).toBe("LT 214 AB");
    expect(vue.jour).toBe("2026-11-02");
    expect(vue.trajet).toMatchObject({
      departId: DEPART_ROUTE,
      origine: "Douala",
      destination: "Yaoundé",
      aBord: 2,
      colis: 3,
      limiteKmh: 100,
      vitesseKmh: 0,
    });
    expect(vue.trajet.prochainArret.nom).toBe("Édéa");
    expect(vue.gps).toBe(false);
    expect(vue.depenses).toEqual({
      lignes: [],
      total: 0,
      categories: ["carburant", "peage", "autre"],
    });
    expect(vue.incidents.retardParDefautMinutes).toBe(20);
    expect(vue.semaine.paieLe).toBe("lundi");
  });

  it("donne la vitesse du GPS quand le signal est frais, et le coupe quand il est perdu", async () => {
    await t.suivi.ecrire({
      departId: DEPART_ROUTE,
      version: 1,
      derniere: {
        instant: t.maintenant(),
        latitude: 3.9,
        longitude: 10.1,
        vitesseKmh: 87.4,
      },
      progressionKm: 40,
      passages: {},
      immobile: null,
      alerteId: null,
    });
    const frais = agence.SchemaChauffeurFeuille.parse((await lire("/agence/bus/chauffeur")).body);
    expect(frais.gps).toBe(true);
    expect(frais.trajet.vitesseKmh).toBe(87);

    await t.suivi.ecrire({
      departId: DEPART_ROUTE,
      version: 2,
      derniere: {
        instant: versIsoDouala(t.horloge.maintenant().getTime() - 10 * 60_000),
        latitude: 3.9,
        longitude: 10.1,
        vitesseKmh: 87.4,
      },
      progressionKm: 40,
      passages: {},
      immobile: null,
      alerteId: null,
    });
    const perdu = agence.SchemaChauffeurFeuille.parse((await lire("/agence/bus/chauffeur")).body);
    expect(perdu.gps).toBe(false);
    expect(perdu.trajet.vitesseKmh).toBe(0);
  });

  it("compte les trajets et les kilomètres de la semaine", async () => {
    const vue = agence.SchemaChauffeurFeuille.parse((await lire("/agence/bus/chauffeur")).body);
    // Le bus en route (08:30) et l'autre bus du même équipage déjà parti ce lundi : seuls les « partis ».
    expect(vue.semaine.trajets).toBe(1);
    expect(vue.semaine.km).toBe(250);
  });

  it("choisit le départ demandé et refuse un autre équipage, un autre rôle, l'absence de jeton", async () => {
    const choisi = await lire(`/agence/bus/chauffeur?departId=${DEPART_EMBARQUEMENT}`);
    expect(agence.SchemaChauffeurFeuille.parse(choisi.body).trajet.departId).toBe(
      DEPART_EMBARQUEMENT,
    );
    const autre = await lire(`/agence/bus/chauffeur?departId=${DEPART_AUTRE_EQUIPAGE}`);
    expect(autre.status).toBe(403);
    expect(autre.body.code).toBe("AUTRE_EQUIPAGE");
    expect((await lire(`/agence/bus/chauffeur?departId=${DEPART_AUTRE_COMPAGNIE}`)).status).toBe(
      404,
    );
    expect((await lire("/agence/bus/chauffeur", t.equipage.convoyeur.jeton)).status).toBe(403);
    expect((await t.http().get("/agence/bus/chauffeur")).status).toBe(401);
  });
});

describe("chauffeur.depense : POST /agence/bus/depenses", () => {
  it("ajoute une dépense avec son justificatif et rend le total du trajet", async () => {
    const evt = depenseEvt({ categorie: "carburant", montant: 25000 });
    const r = await poster("/agence/bus/depenses", evt);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const depense = agence.SchemaResultatDepense.parse(r.body);
    expect(depense.accuse.statut).toBe("accepte");
    expect(depense.depense).toMatchObject({
      categorie: "carburant",
      libelle: "Gasoil, station Total Édéa",
      montant: 25000,
      justificatif: true,
    });
    expect(depense.totalDepenses).toBe(25000);

    const peage = await poster(
      "/agence/bus/depenses",
      depenseEvt({ categorie: "peage", montant: 2000 }),
    );
    expect(agence.SchemaResultatDepense.parse(peage.body).totalDepenses).toBe(27000);

    // La feuille relit les lignes avec leur catégorie.
    const vue = agence.SchemaChauffeurFeuille.parse((await lire("/agence/bus/chauffeur")).body);
    expect(vue.depenses.total).toBe(27000);
    expect(vue.depenses.lignes.map((l) => l.categorie)).toEqual(["carburant", "peage"]);
  });

  it("rejoue le même événement : deja_recu, une seule ligne", async () => {
    const evt = depenseEvt({ montant: 1500 });
    const a = await poster("/agence/bus/depenses", evt);
    const b = await poster("/agence/bus/depenses", evt);
    expect(b.status).toBe(200);
    expect(b.body.accuse.statut).toBe("deja_recu");
    expect(b.body.totalDepenses).toBe(a.body.totalDepenses);
    const lignes = (await t.depenses.duDepart(DEPART_ROUTE)).filter((x) => x.montant === 1500);
    expect(lignes).toHaveLength(1);
  });

  it("refuse un identifiant de dépense déjà pris avec un autre montant : 409 DEPENSE_EXISTANTE", async () => {
    const depenseId = randomUUID();
    expect(
      (await poster("/agence/bus/depenses", depenseEvt({ depenseId, montant: 700 }))).status,
    ).toBe(200);
    const autre = await poster("/agence/bus/depenses", depenseEvt({ depenseId, montant: 800 }));
    expect(autre.status).toBe(409);
    expect(autre.body.code).toBe("DEPENSE_EXISTANTE");
  });

  it("refuse un identifiant qui n'est pas un UUID, un mauvais départ, un état fermé, un corps invalide", async () => {
    const mal = depenseEvt();
    (mal.donnees as { depenseId: string }).depenseId = "dep-1";
    expect((await poster("/agence/bus/depenses", mal)).body.code).toBe("IDENTIFIANT_INVALIDE");
    expect(
      (await poster("/agence/bus/depenses", depenseEvt({ departId: DEPART_AUTRE_EQUIPAGE })))
        .status,
    ).toBe(403);
    expect(
      (await poster("/agence/bus/depenses", depenseEvt({ departId: DEPART_AUTRE_COMPAGNIE })))
        .status,
    ).toBe(404);
    expect(
      (await poster("/agence/bus/depenses", depenseEvt({ departId: DEPART_EN_VENTE }))).status,
    ).toBe(409);
    expect(
      (await poster("/agence/bus/depenses", depenseEvt({ auteur: t.equipage.convoyeur.id })))
        .status,
    ).toBe(403);
    const sansMontant = depenseEvt();
    (sansMontant.donnees as { montant: number }).montant = -5;
    expect((await poster("/agence/bus/depenses", sansMontant)).status).toBe(400);
  });

  it("n'est ouverte qu'au chauffeur", async () => {
    const evt = depenseEvt();
    expect((await poster("/agence/bus/depenses", evt, t.equipage.convoyeur.jeton)).status).toBe(
      403,
    );
    expect((await t.http().post("/agence/bus/depenses").send(evt)).status).toBe(401);
  });
});

describe("chauffeur.incident : POST /agence/bus/incidents", () => {
  it("prévient les voyageurs à bord (un SMS par numéro) et la gare, et garde l'incident", async () => {
    // Les billets 2 et 3 (déjà à bord) ont le même numéro par défaut ; les sièges 5 et 6 aussi : un SMS par
    // numéro, donc deux au total. Un billet à bord sans numéro et un billet encore au quai n'en reçoivent pas.
    await t.billetPaye(DEPART_ROUTE, 5, { aBord: true, telephone: "+237699000001" });
    await t.billetPaye(DEPART_ROUTE, 6, { aBord: true, telephone: "+237699000001" });
    await t.billetPaye(DEPART_ROUTE, 7, { aBord: true, telephone: null });
    await t.billetPaye(DEPART_ROUTE, 8, { telephone: "+237699000002" });
    const evt = incidentEvt({ nature: "accident", note: "Pneu éclaté près d'Édéa" });
    const r = await poster("/agence/bus/incidents", evt);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const prevenus = agence.SchemaResultatPrevenus.parse(r.body);
    expect(prevenus.voyageursPrevenus).toBe(2);
    expect(prevenus.garePrevenue).toBe(true);
    const demande = t.messages.incidents.at(-1);
    expect(demande).toMatchObject({
      libelleNature: "Accident",
      immatriculation: "LT 214 AB",
      origine: "Douala",
      destination: "Yaoundé",
    });
    expect(demande?.voyageurs.map((v) => v.telephone).sort()).toEqual(
      expect.arrayContaining(["+237699000001"]),
    );
    const stockes = await t.incidents.duDepart(DEPART_ROUTE);
    expect(stockes).toHaveLength(1);
    expect(stockes[0]).toMatchObject({
      nature: "accident",
      description: "Pneu éclaté près d'Édéa",
      position: { latitude: 3.8, longitude: 10.2, precisionM: 8 },
      auteurId: chauffeurId,
    });
  });

  it("rejoue le même incident sans renvoyer de SMS", async () => {
    const evt = incidentEvt({ nature: "route_coupee" });
    const avant = t.messages.incidents.length;
    const a = await poster("/agence/bus/incidents", evt);
    const b = await poster("/agence/bus/incidents", evt);
    expect(b.status).toBe(200);
    expect(b.body.accuse.statut).toBe("deja_recu");
    expect(b.body.voyageursPrevenus).toBe(a.body.voyageursPrevenus);
    expect(t.messages.incidents.length).toBe(avant + 1);
  });

  it("garde l'incident quand les SMS ne partent pas", async () => {
    t.messages.echec = true;
    try {
      const r = await poster("/agence/bus/incidents", incidentEvt({ nature: "autre" }));
      expect(r.status).toBe(200);
      expect(agence.SchemaResultatPrevenus.parse(r.body)).toMatchObject({
        voyageursPrevenus: 0,
        garePrevenue: false,
      });
    } finally {
      t.messages.echec = false;
    }
    expect((await t.incidents.duDepart(DEPART_ROUTE)).length).toBeGreaterThanOrEqual(3);
  });

  it("refuse l'autre équipage et un départ en vente ; la nature inconnue est un 400", async () => {
    expect(
      (await poster("/agence/bus/incidents", incidentEvt({ departId: DEPART_AUTRE_EQUIPAGE })))
        .status,
    ).toBe(403);
    const nature = incidentEvt();
    (nature.donnees as { nature: string }).nature = "meteo";
    expect((await poster("/agence/bus/incidents", nature)).status).toBe(400);
    expect(
      (await poster("/agence/bus/incidents", incidentEvt(), t.equipage.controleur.jeton)).status,
    ).toBe(403);
  });
});

describe("chauffeur.retard : POST /agence/bus/retards", () => {
  it("note le retard, prévient les voyageurs à bord et la gare, décale l'heure du prochain arrêt", async () => {
    const avant = agence.SchemaChauffeurFeuille.parse((await lire("/agence/bus/chauffeur")).body);
    const r = await poster("/agence/bus/retards", retardEvt({ minutes: 25 }));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const prevenus = agence.SchemaResultatPrevenus.parse(r.body);
    expect(prevenus.voyageursPrevenus).toBeGreaterThanOrEqual(1);
    expect(prevenus.garePrevenue).toBe(true);
    expect(t.messages.retards.at(-1)).toMatchObject({
      minutes: 25,
      immatriculation: "LT 214 AB",
      origine: "Douala",
      destination: "Yaoundé",
    });
    expect((await t.retards.lire(DEPART_ROUTE))?.minutes).toBe(25);

    const apres = agence.SchemaChauffeurFeuille.parse((await lire("/agence/bus/chauffeur")).body);
    expect(
      Date.parse(apres.trajet.prochainArret.heure) - Date.parse(avant.trajet.prochainArret.heure),
    ).toBe(25 * 60_000);
  });

  it("rejoue le même retard sans renvoyer de SMS", async () => {
    const evt = retardEvt({ minutes: 40 });
    const avant = t.messages.retards.length;
    await poster("/agence/bus/retards", evt);
    const b = await poster("/agence/bus/retards", evt);
    expect(b.body.accuse.statut).toBe("deja_recu");
    expect(t.messages.retards.length).toBe(avant + 1);
  });

  it("ignore un champ en trop (le motif) et refuse des minutes nulles ou un autre équipage", async () => {
    const motif = retardEvt({ minutes: 15 });
    (motif.donnees as Record<string, unknown>).motif = "embouteillage";
    expect((await poster("/agence/bus/retards", motif)).status).toBe(200);
    const nul = retardEvt({ minutes: 1 });
    (nul.donnees as { minutes: number }).minutes = 0;
    expect((await poster("/agence/bus/retards", nul)).status).toBe(400);
    expect(
      (await poster("/agence/bus/retards", retardEvt({ departId: DEPART_AUTRE_EQUIPAGE }))).status,
    ).toBe(403);
    expect(
      (await poster("/agence/bus/retards", retardEvt(), t.equipage.convoyeur.jeton)).status,
    ).toBe(403);
  });
});

describe("chauffeur.arrivee_arret : POST /agence/bus/arrivees", () => {
  it("note l'arrivée à un arrêt : la feuille passe au prochain arrêt", async () => {
    const r = await poster("/agence/bus/arrivees", arriveeEvt("Édéa"));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(agence.SchemaResultatSimple.parse(r.body).accuse.statut).toBe("accepte");
    const passages = await t.passages.duDepart(DEPART_ROUTE, "arrivee");
    expect(passages.map((p) => p.arret)).toEqual(["Édéa"]);
    const vue = agence.SchemaChauffeurFeuille.parse((await lire("/agence/bus/chauffeur")).body);
    expect(vue.trajet.prochainArret.nom).toBe("Yaoundé");
  });

  it("rejoue la même arrivée sans rien refaire", async () => {
    const evt = arriveeEvt("Édéa");
    const a = await poster("/agence/bus/arrivees", evt);
    const b = await poster("/agence/bus/arrivees", evt);
    expect(a.status).toBe(200);
    expect(b.body.accuse.statut).toBe("deja_recu");
    expect(
      (await t.passages.duDepart(DEPART_ROUTE, "arrivee")).filter((p) => p.id === evt.id),
    ).toHaveLength(1);
  });

  it("refuse un arrêt inconnu ou l'origine, un bus qui n'est pas en route, un autre équipage", async () => {
    expect((await poster("/agence/bus/arrivees", arriveeEvt("Kribi"))).body.code).toBe(
      "ARRET_INCONNU",
    );
    expect((await poster("/agence/bus/arrivees", arriveeEvt("Douala"))).body.code).toBe(
      "ARRET_INCONNU",
    );
    const embarquement = await poster(
      "/agence/bus/arrivees",
      arriveeEvt("Édéa", DEPART_EMBARQUEMENT),
    );
    expect(embarquement.status).toBe(409);
    expect(embarquement.body.code).toBe("DEPART_HORS_ROUTE");
    expect(
      (await poster("/agence/bus/arrivees", arriveeEvt("Édéa", DEPART_AUTRE_EQUIPAGE))).status,
    ).toBe(403);
  });

  it("l'arrivée à la destination fait passer le départ à « arrivé »", async () => {
    const r = await poster("/agence/bus/arrivees", arriveeEvt("Yaoundé"));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const dc = await t.catalogue.depart(DEPART_ROUTE);
    expect(dc?.depart.etat).toBe("arrive");
    // Un départ arrivé accepte encore une dépense (le plein du retour), plus un incident.
    expect((await poster("/agence/bus/depenses", depenseEvt({ montant: 300 }))).status).toBe(200);
    expect((await poster("/agence/bus/incidents", incidentEvt())).status).toBe(409);
  });
});
