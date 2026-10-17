import { patron, voyageur } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUTRE_COMPAGNIE,
  COORDONNEES,
  DEPART,
  DEPART_2,
  DEPART_AUTRE,
  pointAuKm,
  pointPouma,
  trajetType,
} from "./testing/monde";
import { avec, creerAppGpsTest, peupler, type AppGpsTest } from "./testing/app-gps-test";
import { MS_PAR_MINUTE, versIsoDouala } from "./temps";

/**
 * Suivi GPS par l'API réelle (gardes, rôles) : réception des positions, « Mon bus en direct »,
 * prévenir un proche, alerte d'arrêt anormal, salle de contrôle, monter en route. Chaque réponse
 * est relue avec le schéma zod du contrat.
 */

let t: AppGpsTest;
let g: Awaited<ReturnType<typeof peupler>>;

beforeAll(async () => {
  t = await creerAppGpsTest();
  g = await peupler(t);
});
afterAll(async () => t.fermer());

/** Une position à l'instant du serveur (plus `decalageS` secondes), au kilomètre `km`. */
function position(km: number, extra: Record<string, unknown> = {}, decalageS = 0) {
  return {
    instant: versIsoDouala(t.horloge.maintenant().getTime() + decalageS * 1000),
    ...pointAuKm(km),
    precisionM: 8,
    vitesseKmh: 80,
    ...extra,
  };
}

const envoyer = (jeton: string, positions: unknown[], departId = DEPART) =>
  t.http().post(`/gps/bus/${departId}/positions`).set(avec(jeton)).send({ positions });

const avancer = (minutes: number) => t.horloge.avancer(minutes * MS_PAR_MINUTE);
const suivi = (jeton = g.voyageur.jeton, billet = "billet-1") =>
  t.http().get(`/voyageur/billets/${billet}/direct`).set(avec(jeton));

describe("réception des positions", () => {
  it("exige un jeton, puis le rôle chauffeur ou convoyeur", async () => {
    const sansJeton = await t.http().post(`/gps/bus/${DEPART}/positions`).send({ positions: [] });
    expect(sansJeton.status).toBe(401);
    for (const compte of [g.voyageur, g.patron, g.superviseur, g.livreur]) {
      const r = await envoyer(compte.jeton, [position(5)]);
      expect(r.status).toBe(403);
    }
  });

  it("refuse un chauffeur qui n'est pas dans l'équipage du départ", async () => {
    const r = await envoyer(g.autreChauffeur.jeton, [position(5)]);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: "EQUIPAGE_REQUIS" });
  });

  it("ne révèle pas un départ d'une autre compagnie", async () => {
    const ailleurs = await t.compte("chauffeur", { compagnieId: AUTRE_COMPAGNIE });
    const r = await envoyer(ailleurs.jeton, [position(5)]);
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ code: "DEPART_INCONNU" });
    expect((await envoyer(g.chauffeur.jeton, [position(5)], "inconnu")).status).toBe(404);
  });

  it("refuse un départ qui n'est ni à l'embarquement ni en route", async () => {
    const r = await envoyer(g.autreChauffeur.jeton, [position(5)], DEPART_2);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "DEPART_NON_EN_ROUTE", details: { etat: "en_vente" } });
  });

  it("lit le corps avec rigueur : coordonnées, instant, taille du lot", async () => {
    const mauvais: unknown[] = [
      {},
      { positions: [] },
      { positions: [{ ...position(5), latitude: 91 }] },
      { positions: [{ ...position(5), longitude: -181 }] },
      { positions: [{ ...position(5), instant: "2026-11-02T09:00:00Z" }] },
      { positions: [{ ...position(5), vitesseKmh: -1 }] },
      { positions: [{ ...position(5), vitesseKmh: 400 }] },
      { positions: [{ ...position(5), precisionM: -2 }] },
      { positions: [{ ...position(5), latitude: "4.05" }] },
      { positions: Array.from({ length: 101 }, () => position(5)) },
    ];
    for (const corps of mauvais) {
      const r = await t
        .http()
        .post(`/gps/bus/${DEPART}/positions`)
        .set(avec(g.chauffeur.jeton))
        .send(corps as object);
      expect(r.status, JSON.stringify(corps).slice(0, 80)).toBe(400);
      expect(r.body).toMatchObject({ code: "REQUETE_INVALIDE" });
    }
  });

  it("garde les positions, compte les doublons et rejette une à une celles du futur", async () => {
    avancer(1);
    const p = position(10);
    const r = await envoyer(g.chauffeur.jeton, [
      p,
      position(11, {}, 30),
      position(12, {}, 3600), // une heure d'avance : l'horloge du téléphone est fausse
    ]);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      acceptees: 2,
      doublons: 0,
      rejetees: [{ rang: 2, motif: "dans_le_futur" }],
    });
    expect(r.body.serveurA).toBe(t.maintenant());

    // Le téléphone renvoie son lot (réponse perdue) : rien de nouveau.
    const rejeu = await envoyer(g.chauffeur.jeton, [p, position(11, {}, 30)]);
    expect(rejeu.body).toMatchObject({ acceptees: 0, doublons: 2, rejetees: [] });
    expect(t.positions.compter(`bus:${DEPART}`)).toBe(2);
  });

  it("le chauffeur et le convoyeur envoient en même temps : l'état suit la plus récente", async () => {
    avancer(2);
    const [a, b] = await Promise.all([
      envoyer(g.chauffeur.jeton, [position(20, {}, 0)]),
      envoyer(g.convoyeur.jeton, [position(21, {}, 10)]),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const etat = await t.etats.lire(DEPART);
    expect(etat?.progressionKm).toBeCloseTo(21, 0);
    expect(etat?.derniere?.latitude).toBeCloseTo(pointAuKm(21).latitude, 5);
  });
});

describe("mon bus en direct", () => {
  it("n'est ouvert qu'au voyageur du billet", async () => {
    expect((await t.http().get("/voyageur/billets/billet-1/direct")).status).toBe(401);
    expect((await suivi(g.autreVoyageur.jeton)).status).toBe(404); // billet d'un autre
    expect((await suivi(g.chauffeur.jeton)).status).toBe(403);
    const inconnu = await suivi(g.voyageur.jeton, "billet-inconnu");
    expect(inconnu.status).toBe(404);
    expect(inconnu.body).toMatchObject({ code: "BILLET_INCONNU" });
  });

  it("refuse un billet annulé", async () => {
    t.billets.ajouter({
      billetId: "billet-annule",
      departId: DEPART,
      voyageurId: g.voyageur.id,
      siege: 3,
      passagerNom: "Aïcha",
      valide: false,
    });
    const r = await suivi(g.voyageur.jeton, "billet-annule");
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "BILLET_ANNULE" });
  });

  it("répond au contrat : arrivée estimée, retard, étapes, proche proposé", async () => {
    avancer(53); // 09:00 : le bus est à l'heure à 58 km.
    expect((await envoyer(g.chauffeur.jeton, [position(58, { vitesseKmh: 84 })])).status).toBe(200);
    const r = await suivi();
    expect(r.status).toBe(200);
    const s = voyageur.SchemaSuiviBus.parse(r.body);
    expect(s).toMatchObject({
      billetId: "billet-1",
      enDirect: true,
      compagnie: { nom: "Alpha Voyages" },
      siege: 7,
      bus: { immatriculation: "LT 412 AB" },
      villes: ["Douala", "Edéa", "Yaoundé"],
      vitesseKmh: 84,
      arrivee: { prevue: "2026-11-02T12:30:00.000+01:00", retardMinutes: 0 },
      prevenir: {
        procheId: "proche-maman",
        nom: "Maman",
        minutesAvantArrivee: 15,
        gareArrivee: "Mvan",
        actif: false,
      },
    });
    expect(s.etapes.map((e) => [e.arret, e.statut])).toEqual([
      ["Douala Akwa", "passe"],
      ["Edéa", "prochain"],
      ["Pouma", "a_venir"],
      ["Boumnyebel", "a_venir"],
    ]);
    expect(s.etapes[0]).toMatchObject({
      heure: "2026-11-02T08:00:00.000+01:00",
      precision: "parti",
    });
    expect(s.etapes[1]).toMatchObject({ precision: "arrêt 10 min", arretMinutes: 10 });
    expect(s.etapes[3]).toMatchObject({ precision: "4 places montent ici", placesQuiMontent: 4 });
  });

  it("le retard se lit sur la position et se reporte sur l'arrivée estimée", async () => {
    avancer(10); // 09:10 et le bus est toujours à 58 km : environ 10 minutes de retard.
    await envoyer(g.chauffeur.jeton, [position(58, { vitesseKmh: 10 })]);
    const s = voyageur.SchemaSuiviBus.parse((await suivi()).body);
    expect(s.arrivee.retardMinutes).toBeGreaterThanOrEqual(9);
    expect(s.arrivee.retardMinutes).toBeLessThanOrEqual(11);
    const decalage = Date.parse(s.arrivee.estimee) - Date.parse(s.arrivee.prevue);
    expect(decalage).toBeGreaterThan(8 * MS_PAR_MINUTE);
  });

  it("un bus qui n'a rien envoyé depuis plus de 2 minutes n'est plus en direct", async () => {
    avancer(3);
    expect(voyageur.SchemaSuiviBus.parse((await suivi()).body).enDirect).toBe(false);
  });

  it("n'expose ni l'identité de l'équipage ni le numéro du proche", async () => {
    const corps = JSON.stringify((await suivi()).body);
    for (const secret of [g.chauffeur.id, g.convoyeur.id, "+237699401822"]) {
      expect(corps).not.toContain(secret);
    }
  });
});

describe("état du bus pour l'équipage et la direction", () => {
  it("rend la dernière position, la vitesse et le prochain arrêt", async () => {
    const r = await t.http().get(`/gps/bus/${DEPART}`).set(avec(g.chauffeur.jeton));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      departId: DEPART,
      immatriculation: "LT 412 AB",
      gps: false, // pas d'envoi depuis 3 minutes
      vitesseKmh: 10,
      prochainArret: { nom: "Edéa" },
      periodeEnvoiSecondes: 30,
      alerte: null,
    });
    expect(r.body.latitude).toBeCloseTo(pointAuKm(58).latitude, 5);
    for (const compte of [g.convoyeur, g.superviseur, g.patron]) {
      expect((await t.http().get(`/gps/bus/${DEPART}`).set(avec(compte.jeton))).status).toBe(200);
    }
  });

  it("ferme la porte aux autres équipages, aux autres compagnies et aux voyageurs", async () => {
    const autre = await t.http().get(`/gps/bus/${DEPART}`).set(avec(g.autreChauffeur.jeton));
    expect(autre.status).toBe(403);
    const patronAilleurs = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE });
    const ailleurs = await t.http().get(`/gps/bus/${DEPART}`).set(avec(patronAilleurs.jeton));
    expect(ailleurs.status).toBe(404);
    const voyageurRefuse = await t.http().get(`/gps/bus/${DEPART}`).set(avec(g.voyageur.jeton));
    expect(voyageurRefuse.status).toBe(403);
  });
});

describe("prévenir un proche", () => {
  beforeAll(() => {
    t.proches.ajouter(g.voyageur.id, {
      id: "proche-papa",
      nom: "Papa",
      telephone: "+237677112233",
    });
  });

  const prevenir = (corps: unknown, jeton = g.voyageur.jeton, billet = "billet-1") =>
    t
      .http()
      .put(`/voyageur/billets/${billet}/prevenir`)
      .set(avec(jeton))
      .send(corps as object);
  const ajouterBillet = (billetId: string, departId = DEPART) =>
    t.billets.ajouter({
      billetId,
      departId,
      voyageurId: g.voyageur.id,
      siege: 8,
      passagerNom: "Aïcha",
      valide: true,
    });

  it("active le SMS avec 15 minutes par défaut, sans rien envoyer tant que le bus est loin", async () => {
    const r = await prevenir({ procheId: "proche-maman" });
    expect(r.status).toBe(200);
    expect(voyageur.SchemaResultatPrevenirProche.parse(r.body)).toEqual({
      billetId: "billet-1",
      procheId: "proche-maman",
      actif: true,
      minutesAvantArrivee: 15,
    });
    expect(t.avis.prochesPrevenus).toHaveLength(0);
    const s = voyageur.SchemaSuiviBus.parse((await suivi()).body);
    expect(s.prevenir).toMatchObject({ procheId: "proche-maman", actif: true });
  });

  it("refuse un corps invalide, un proche inconnu, un billet qui n'est pas à soi", async () => {
    const mauvais = [
      {},
      { procheId: "" },
      { procheId: "proche-maman", minutesAvantArrivee: 0 },
      { procheId: "proche-maman", minutesAvantArrivee: 121 },
      { procheId: "proche-maman", minutesAvantArrivee: 1.5 },
    ];
    for (const corps of mauvais) expect((await prevenir(corps)).status).toBe(400);
    const inconnu = await prevenir({ procheId: "proche-inconnu" });
    expect(inconnu.status).toBe(404);
    expect(inconnu.body).toMatchObject({ code: "PROCHE_INCONNU" });
    expect((await prevenir({ procheId: "proche-maman" }, g.autreVoyageur.jeton)).status).toBe(404);
    expect((await prevenir({ procheId: "proche-maman" }, g.chauffeur.jeton)).status).toBe(403);
  });

  it("envoie le SMS une seule fois, quand l'arrivée est dans 15 minutes", async () => {
    // Le bus tient l'horaire : arrivée à 12:30. À 12:00 (km 221), c'est dans 30 minutes.
    t.horloge.avancer(
      Date.parse("2026-11-02T12:00:00.000+01:00") - t.horloge.maintenant().getTime(),
    );
    await envoyer(g.chauffeur.jeton, [position(221, { vitesseKmh: 90 })]);
    expect(t.avis.prochesPrevenus).toHaveLength(0);

    avancer(10); // 12:10 (km 231) : dans 20 minutes
    await envoyer(g.chauffeur.jeton, [position(231, { vitesseKmh: 90 })]);
    expect(t.avis.prochesPrevenus).toHaveLength(0);

    avancer(6); // 12:16 (km 237) : dans 14 minutes
    await envoyer(g.chauffeur.jeton, [position(237, { vitesseKmh: 90 })]);
    expect(t.avis.appels).toHaveLength(1);
    const avis = t.avis.prochesPrevenus[0]!;
    expect(avis).toMatchObject({
      cle: "gps:proche:billet-1:proche-maman",
      billetId: "billet-1",
      voyageurNom: "Aïcha",
      gareArrivee: "Mvan",
      compagnieNom: "Alpha Voyages",
      proche: { nom: "Maman", telephone: "+237699401822" },
    });
    const arrivee = Date.parse(avis.arriveeEstimee);
    expect(arrivee - t.horloge.maintenant().getTime()).toBeLessThanOrEqual(15 * MS_PAR_MINUTE);

    // Les positions suivantes ne renvoient rien.
    avancer(1);
    await envoyer(g.chauffeur.jeton, [position(238)]);
    avancer(1);
    await envoyer(g.chauffeur.jeton, [position(239)]);
    expect(t.avis.appels).toHaveLength(1);

    // L'écran sait que le SMS est parti et à quel numéro.
    const r = await prevenir({ procheId: "proche-maman" });
    expect(voyageur.SchemaResultatPrevenirProche.parse(r.body)).toMatchObject({
      actif: true,
      envoyeA: "+237699401822",
    });
    expect(t.avis.appels).toHaveLength(1);
  });

  it("un échec d'envoi n'arrête pas le suivi et le SMS repart à la position suivante", async () => {
    ajouterBillet("billet-2");
    t.avis.echecs = 1;
    // Le bus est déjà dans la fenêtre : le SMS tente de partir tout de suite et échoue.
    const r = await prevenir({ procheId: "proche-papa" }, g.voyageur.jeton, "billet-2");
    expect(r.status).toBe(200);
    expect(r.body.envoyeA).toBeUndefined();
    expect(t.avis.prochesPrevenus.filter((a) => a.billetId === "billet-2")).toHaveLength(0);

    avancer(0.5);
    const suite = await envoyer(g.chauffeur.jeton, [position(240)]);
    expect(suite.status).toBe(200);
    expect(t.avis.appels.filter((a) => a.billetId === "billet-2")).toHaveLength(1);
  });

  it("se désactive tant que le SMS n'est pas parti, et n'envoie plus rien", async () => {
    ajouterBillet("billet-3");
    const avantEnvoi = t.avis.appels.length;
    t.avis.echecs = 1; // le SMS immédiat échoue : il reste en attente
    await prevenir({ procheId: "proche-maman" }, g.voyageur.jeton, "billet-3");
    const r = await t
      .http()
      .delete("/voyageur/billets/billet-3/prevenir/proche-maman")
      .set(avec(g.voyageur.jeton));
    expect(r.status).toBe(200);
    expect(voyageur.SchemaResultatPrevenirProche.parse(r.body)).toMatchObject({ actif: false });
    avancer(0.5);
    await envoyer(g.chauffeur.jeton, [position(241)]);
    expect(t.avis.appels).toHaveLength(avantEnvoi);
    const inconnu = await t
      .http()
      .delete("/voyageur/billets/billet-3/prevenir/proche-papa")
      .set(avec(g.voyageur.jeton));
    expect(inconnu.status).toBe(404);
  });

  it("activer un autre proche désactive le précédent tant que son SMS n'est pas parti", async () => {
    ajouterBillet("billet-4", DEPART_2);
    await prevenir({ procheId: "proche-maman" }, g.voyageur.jeton, "billet-4");
    await prevenir(
      { procheId: "proche-papa", minutesAvantArrivee: 30 },
      g.voyageur.jeton,
      "billet-4",
    );
    const lignes = await t.prevenirs.deBillet("billet-4");
    expect(lignes.map((l) => [l.procheId, l.actif])).toEqual(
      expect.arrayContaining([
        ["proche-maman", false],
        ["proche-papa", true],
      ]),
    );
    expect(lignes.find((l) => l.procheId === "proche-papa")?.minutesAvantArrivee).toBe(30);
  });
});

describe("alerte d'arrêt anormal et salle de contrôle", () => {
  let tt: AppGpsTest;
  let gg: Awaited<ReturnType<typeof peupler>>;

  beforeAll(async () => {
    tt = await creerAppGpsTest({ debut: new Date("2026-11-02T08:05:00.000Z") }); // 09:05
    gg = await peupler(tt);
  });
  afterAll(async () => tt.fermer());

  const pos = (km: number, extra: Record<string, unknown> = {}) => ({
    instant: versIsoDouala(tt.horloge.maintenant()),
    ...pointAuKm(km),
    precisionM: 8,
    vitesseKmh: 80,
    ...extra,
  });
  const poster = (positions: unknown[], jeton = gg.convoyeur.jeton) =>
    tt.http().post(`/gps/bus/${DEPART}/positions`).set(avec(jeton)).send({ positions });
  const carte = (jeton = gg.patron.jeton) => tt.http().get("/patron/controle/bus").set(avec(jeton));

  it("sans alerte : les bus en route et leur position", async () => {
    await poster([pos(70, { vitesseKmh: 80 })]);
    const r = await carte();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      busEnRoute: 1,
      alerte: null,
      aTraiter: [],
      bus: [
        {
          departId: DEPART,
          immatriculation: "LT 412 AB",
          compagnie: "Alpha Voyages",
          ligne: "Douala → Yaoundé",
          prochainArret: "Pouma",
          vitesseKmh: 80,
          enDirect: true,
        },
      ],
    });
    expect(r.body.bus[0]).not.toHaveProperty("arretMinutes");
  });

  it("ouvre l'alerte après 10 minutes d'arrêt hors arrêt, pas avant", async () => {
    // 9 minutes 30 d'arrêt à 70 km (5 km après Edéa).
    for (let i = 0; i < 20; i++) {
      tt.horloge.avancer(30_000);
      await poster([pos(70, { vitesseKmh: 0 })]);
    }
    expect((await carte()).body.alerte).toBeNull();
    expect(tt.avis.alertes).toHaveLength(0);

    tt.horloge.avancer(30_000);
    await poster([pos(70, { vitesseKmh: 0 })]); // 10 minutes pile
    const r = await carte();
    expect(r.body.alerte).toMatchObject({ immatriculation: "LT 412 AB", soupcon: "autre" });
    expect(r.body.alerte.arretMinutes).toBeGreaterThanOrEqual(10);
    expect(tt.avis.alertes).toHaveLength(1);

    // L'alerte d'une compagnie n'est jamais vue par une autre.
    const ailleurs = await tt.compte("patron", { compagnieId: AUTRE_COMPAGNIE });
    const vue = await carte(ailleurs.jeton);
    expect(vue.body.alerte).toBeNull();
    expect(vue.body.aTraiter).toEqual([]);
  });

  it("l'alerte a la forme de la salle de contrôle (carte.alerte et à traiter)", async () => {
    const r = await carte();
    const element = patron.ATraiterSchema.parse(r.body.aTraiter[0]);
    expect(element).toMatchObject({ type: "bus_arrete" });
    expect(element.texte).toMatch(/^LT 412 AB arrêté 1\d min après Edéa · 36 à bord$/);
    patron.SalleDeControleSchema.shape.carte.shape.alerte.parse(r.body.alerte);
    expect(r.body.bus[0].arretMinutes).toBe(r.body.alerte.arretMinutes);
  });

  it("une seule alerte reste ouverte tant que le bus ne bouge pas", async () => {
    for (let i = 0; i < 6; i++) {
      tt.horloge.avancer(30_000);
      await poster([pos(70, { vitesseKmh: 0 })]);
    }
    expect(tt.avis.alertes).toHaveLength(1);
    expect(tt.alertes.toutes().filter((a) => a.resolueA === null)).toHaveLength(1);
    expect((await carte()).body.aTraiter).toHaveLength(1);
  });

  it("l'alerte se ferme quand le bus repart", async () => {
    tt.horloge.avancer(30_000);
    await poster([pos(72, { vitesseKmh: 70 })]);
    const r = await carte();
    expect(r.body.alerte).toBeNull();
    expect(r.body.aTraiter).toEqual([]);
    expect(tt.alertes.toutes()[0]?.resolueA).not.toBeNull();
  });

  it("ne montre les bus qu'à la direction de la compagnie", async () => {
    expect((await carte(gg.superviseur.jeton)).status).toBe(200);
    for (const compte of [gg.voyageur, gg.chauffeur, gg.livreur]) {
      expect((await carte(compte.jeton)).status).toBe(403);
    }
    expect((await tt.http().get("/patron/controle/bus")).status).toBe(401);
    const ailleurs = await tt.compte("patron", { compagnieId: AUTRE_COMPAGNIE });
    const r = await carte(ailleurs.jeton);
    expect(r.body.bus).toEqual([]); // jamais les bus d'une autre compagnie
    expect(r.body.busEnRoute).toBe(1); // son propre bus, sans position encore
  });
});

describe("monter en route", () => {
  let tt: AppGpsTest;
  let gg: Awaited<ReturnType<typeof peupler>>;

  beforeAll(async () => {
    tt = await creerAppGpsTest({ debut: new Date("2026-11-02T08:50:00.000Z") }); // 09:50
    gg = await peupler(tt);
    tt.offres.definir(DEPART, "arret-pouma-a", { placesLibres: 3, prix: 4500, prorata: true });
    tt.offres.definir(DEPART_2, "arret-pouma-a", { placesLibres: 7, prix: 2500, prorata: true });
    tt.offres.definir(DEPART_AUTRE, "arret-pouma-a", {
      placesLibres: 0,
      prix: 2400,
      prorata: true,
    });
    // Le bus est à Edéa à 09:50, loin de son horaire (Edéa était prévu à 09:07).
    await tt
      .http()
      .post(`/gps/bus/${DEPART}/positions`)
      .set(avec(gg.chauffeur.jeton))
      .send({
        positions: [{ instant: tt.maintenant(), ...pointAuKm(66), precisionM: 8, vitesseKmh: 60 }],
      });
  });
  afterAll(async () => tt.fermer());

  const offres = (requete: string, jeton = gg.voyageur.jeton) =>
    tt.http().get(`/voyageur/monter-en-route${requete}`).set(avec(jeton));

  it("exige un arrêt ou une position, et un voyageur", async () => {
    expect((await offres("")).status).toBe(400);
    expect((await offres("?lat=4.05")).status).toBe(400);
    expect((await offres("?lat=abc&lng=9")).status).toBe(400);
    expect((await offres("?lat=95&lng=9")).status).toBe(400);
    expect((await offres("?arretId=inconnu")).status).toBe(404);
    expect((await offres("?lat=10&lng=-30")).status).toBe(404);
    expect((await offres("?arretId=arret-pouma-a", gg.chauffeur.jeton)).status).toBe(403);
    const sansJeton = await tt.http().get("/voyageur/monter-en-route?arretId=arret-pouma-a");
    expect(sansJeton.status).toBe(401);
  });

  it("propose les bus qui passent avec des places, triés par heure de passage", async () => {
    const r = await offres("?arretId=arret-pouma-a");
    expect(r.status).toBe(200);
    const o = voyageur.SchemaOffresMonteeEnRoute.parse(r.body);
    expect(o).toMatchObject({
      maintenant: "2026-11-02T09:50:00.000+01:00",
      arret: { id: "arret-pouma-a", nom: "Pouma", gps: false },
      ligne: {
        libelle: "Douala → Yaoundé",
        sens: "vers Yaoundé",
        arrets: ["Douala", "Edéa", "Pouma", "Boumnyebel", "Yaoundé"],
        arretCourant: "Pouma",
        pointDeMontee: "Point de montée : station Total Pouma, côté droit.",
      },
    });
    // L'autre compagnie n'a plus de place : elle n'est pas proposée.
    expect(o.bus.map((b) => b.departId)).toEqual([DEPART, DEPART_2]);
    expect(o.bus[0]).toMatchObject({
      compagnie: { nom: "Alpha Voyages" },
      classe: "classique",
      placesLibres: 3,
      prix: 4500,
      prorata: true,
      partiA: "2026-11-02T08:00:00.000+01:00",
    });
    expect(o.bus[1]).toMatchObject({ placesLibres: 7, prix: 2500 });
    expect(o.bus[1]).not.toHaveProperty("partiA");
  });

  it("l'heure de passage vient de la position du bus, pas de l'horaire", async () => {
    const o = voyageur.SchemaOffresMonteeEnRoute.parse(
      (await offres("?arretId=arret-pouma-a")).body,
    );
    const [premier, second] = o.bus;
    // Prévu 10:04 ; avec 32 minutes de retard : vers 10:36.
    expect(Date.parse(premier!.passeA)).toBeGreaterThan(Date.parse("2026-11-02T10:33:00+01:00"));
    expect(Date.parse(premier!.passeA)).toBeLessThan(Date.parse("2026-11-02T10:39:00+01:00"));
    expect(premier!.passeDansMinutes).toBeGreaterThan(43);
    expect(premier!.passeDansMinutes).toBeLessThan(49);
    // Le bus de 10:00 n'est pas parti : il passe à l'heure prévue, 124 minutes après son départ
    // (conduite de 260 min répartie sur 250 km, plus l'arrêt d'Edéa).
    expect(second!.passeA).toBe("2026-11-02T12:04:24.000+01:00");
    expect(second!.passeDansMinutes).toBe(
      Math.ceil((Date.parse(second!.passeA) - Date.parse(o.maintenant)) / MS_PAR_MINUTE),
    );
    expect(Date.parse(premier!.arriveeDestination)).toBeGreaterThan(
      Date.parse("2026-11-02T12:30:00+01:00"),
    );
  });

  it("retrouve l'arrêt le plus proche d'une position GPS", async () => {
    const o = voyageur.SchemaOffresMonteeEnRoute.parse(
      (await offres("?lat=3.8335&lng=10.5331")).body,
    );
    expect(o.arret).toMatchObject({ id: "arret-pouma-a", nom: "Pouma", gps: true });
    expect(o.bus.map((b) => b.departId)).toEqual([DEPART, DEPART_2]);
  });

  it("ne propose pas un bus qui passe dans plus de 4 heures", async () => {
    tt.reseau.changerTrajet(DEPART_2, { heureDepart: "2026-11-02T20:00:00.000+01:00" });
    const o = voyageur.SchemaOffresMonteeEnRoute.parse(
      (await offres("?arretId=arret-pouma-a")).body,
    );
    expect(o.bus.map((b) => b.departId)).toEqual([DEPART]);
    tt.reseau.changerTrajet(DEPART_2, { heureDepart: "2026-11-02T10:00:00.000+01:00" });
  });

  it("ne propose ni la destination ni un arrêt où le bus ne prend personne", async () => {
    // Un voyageur à la destination du bus : on n'y monte pas.
    tt.reseau.ajouterArret({
      ...pointPouma("arret-yde-a"),
      nom: "Yaoundé Mvan",
      ...COORDONNEES.yaounde,
    });
    const destination = voyageur.SchemaOffresMonteeEnRoute.parse(
      (await offres("?arretId=arret-yde-a")).body,
    );
    expect(destination.bus).toEqual([]);
    // Même si la ligne marquait la destination comme arrêt de montée, on n'y monte pas.
    const montee = trajetType(DEPART).arrets.map((a) => ({ ...a, montee: true }));
    tt.reseau.changerTrajet(DEPART, { arrets: montee });
    tt.reseau.changerTrajet(DEPART_2, { arrets: montee });
    tt.offres.definir(DEPART, "arret-yde-a", { placesLibres: 3, prix: 4500, prorata: true });
    tt.offres.definir(DEPART_2, "arret-yde-a", { placesLibres: 3, prix: 4500, prorata: true });
    const encore = voyageur.SchemaOffresMonteeEnRoute.parse(
      (await offres("?arretId=arret-yde-a")).body,
    );
    expect(encore.bus).toEqual([]);
    tt.reseau.changerTrajet(DEPART, { arrets: trajetType(DEPART).arrets });

    // À Pouma, un bus qui ne prend plus personne n'est pas proposé.
    const arrets = trajetType(DEPART_2).arrets.map((a) =>
      a.nom === "Pouma" ? { ...a, montee: false } : a,
    );
    tt.reseau.changerTrajet(DEPART_2, { arrets });
    const o = voyageur.SchemaOffresMonteeEnRoute.parse(
      (await offres("?arretId=arret-pouma-a")).body,
    );
    expect(o.bus.map((b) => b.departId)).toEqual([DEPART]);
    tt.reseau.changerTrajet(DEPART_2, { arrets: trajetType(DEPART_2).arrets });
  });

  it("ne propose plus un bus qui a déjà passé l'arrêt", async () => {
    tt.horloge.avancer(10 * MS_PAR_MINUTE);
    await tt
      .http()
      .post(`/gps/bus/${DEPART}/positions`)
      .set(avec(gg.chauffeur.jeton))
      .send({
        positions: [{ instant: tt.maintenant(), ...pointAuKm(120), precisionM: 8, vitesseKmh: 90 }],
      });
    const o = voyageur.SchemaOffresMonteeEnRoute.parse(
      (await offres("?arretId=arret-pouma-a")).body,
    );
    expect(o.bus.map((b) => b.departId)).toEqual([DEPART_2]);
  });
});

describe("livreur moto", () => {
  const mission = {
    colisId: "colis-1",
    expediteurId: "exp-1",
    destinataireId: "dest-1",
    active: true,
    retire: true,
    retrait: { latitude: 4.05, longitude: 9.7 },
    remise: { latitude: 4.06, longitude: 9.7 },
  };

  it("n'accepte que les positions du livreur de la mission en cours", async () => {
    t.missions.ajouter({ ...mission, livreurId: g.livreur.id });
    const envoi = (jeton: string, colis = "colis-1") =>
      t
        .http()
        .post(`/gps/livraisons/${colis}/positions`)
        .set(avec(jeton))
        .send({
          positions: [{ instant: t.maintenant(), latitude: 4.05, longitude: 9.7, vitesseKmh: 25 }],
        });

    const ok = await envoi(g.livreur.jeton);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ acceptees: 1, doublons: 0, rejetees: [] });
    expect((await envoi(g.livreur.jeton)).body).toMatchObject({ acceptees: 0, doublons: 1 });

    const autre = await t.compte("livreur");
    const refuse = await envoi(autre.jeton);
    expect(refuse.status).toBe(404);
    expect(refuse.body).toMatchObject({ code: "MISSION_INCONNUE" });
    expect((await envoi(g.livreur.jeton, "colis-inconnu")).status).toBe(404);
    expect((await envoi(g.chauffeur.jeton)).status).toBe(403);
    expect((await envoi(g.voyageur.jeton)).status).toBe(403);

    t.missions.changer("colis-1", { active: false });
    const finie = await envoi(g.livreur.jeton);
    expect(finie.status).toBe(409);
    expect(finie.body).toMatchObject({ code: "MISSION_TERMINEE" });
  });
});

describe("accès par défaut refusé", () => {
  it("chaque route du module exige un jeton", async () => {
    const reponses = await Promise.all([
      t.http().post(`/gps/bus/${DEPART}/positions`).send({}),
      t.http().get(`/gps/bus/${DEPART}`),
      t.http().post("/gps/livraisons/colis-1/positions").send({}),
      t.http().get("/voyageur/billets/billet-1/direct"),
      t.http().put("/voyageur/billets/billet-1/prevenir").send({}),
      t.http().delete("/voyageur/billets/billet-1/prevenir/proche-maman"),
      t.http().get("/voyageur/monter-en-route?arretId=arret-pouma-a"),
      t.http().get("/patron/controle/bus"),
    ]);
    expect(reponses.map((r) => r.status)).toEqual(Array(8).fill(401));
  });
});
