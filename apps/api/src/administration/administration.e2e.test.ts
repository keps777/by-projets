import { patron } from "@afrimove/contrats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROLES } from "../socle/auth/roles";
import { ParcBus } from "./ports";
import {
  AGENCE,
  AUTRE_AGENCE,
  BAFOUSSAM,
  DOUALA_AKWA,
  GARE_AUTRE_AGENCE,
  YAOUNDE_MVAN,
  creerAppAdminTest,
  type AppAdminTest,
} from "./testing/app-admin-test";

/**
 * L'administration en HTTP, sur les adaptateurs en mémoire : accès par rôle, signature PIN, création et réglage
 * d'une ligne (contrats du patron), génération récurrente des départs, équipages et conflits, bus.
 * Les appareils et l'effacement à distance sont dans `appareils.e2e.test.ts`.
 */

let t: AppAdminTest;
let patronJeton: string;
let superviseurAkwa: string;
let superviseurYaounde: string;
let patronAutreAgence: string;
let ligneId: string;

const TARIFS = { classique: 4000, vip: 6000, bagage: 500 };

const departEditable = (surcharge: Record<string, unknown> = {}) => ({
  id: null,
  heure: "05:30",
  heureInitiale: null,
  classe: "classique",
  prix: 4000,
  actif: true,
  note: null,
  jours: [],
  nouveau: true,
  ...surcharge,
});

beforeAll(async () => {
  t = await creerAppAdminTest();
  patronJeton = (await t.compte("patron", { gareId: null })).jeton;
  superviseurAkwa = (await t.compte("superviseur", { gareId: DOUALA_AKWA })).jeton;
  superviseurYaounde = (await t.compte("superviseur", { gareId: YAOUNDE_MVAN })).jeton;
  patronAutreAgence = (await t.compte("patron", { compagnieId: AUTRE_AGENCE, gareId: null })).jeton;
});

afterAll(async () => {
  await t.fermer();
});

const creerLigne = (surcharge: Record<string, unknown> = {}, jeton = patronJeton) =>
  t
    .http()
    .post("/patron/reglages/lignes")
    .set(t.auth(jeton))
    .send({
      origineGareId: DOUALA_AKWA,
      destinationGareId: YAOUNDE_MVAN,
      tarifs: TARIFS,
      arrets: ["Édéa", "Makak"],
      capacite: 70,
      signature: t.signature(),
      ...surcharge,
    });

const modifierLigne = (corps: Record<string, unknown>, jeton = patronJeton, id = ligneId) =>
  t
    .http()
    .put(`/patron/reglages/lignes/${id}`)
    .set(t.auth(jeton))
    .send({ ligneId: id, signature: t.signature(), ...corps });

describe("accès", () => {
  it("refuse sans jeton", async () => {
    for (const chemin of [
      "/admin/lignes",
      "/admin/bus",
      "/admin/departs",
      "/admin/appareils",
      "/admin/gares",
    ]) {
      expect((await t.http().get(chemin)).status, chemin).toBe(401);
    }
    expect((await t.http().post("/patron/reglages/lignes").send({})).status).toBe(401);
  });

  it("réserve l'administration au patron et au superviseur", async () => {
    for (const role of ROLES.filter((r) => r !== "patron" && r !== "superviseur")) {
      const { jeton } = await t.compte(role);
      for (const chemin of ["/admin/lignes", "/admin/bus", "/admin/departs", "/admin/appareils"]) {
        expect((await t.http().get(chemin).set(t.auth(jeton))).status, `${role} ${chemin}`).toBe(
          403,
        );
      }
    }
  });

  it("réserve les réglages de ligne au patron : le superviseur n'y accède pas", async () => {
    expect((await creerLigne({}, superviseurAkwa)).status).toBe(403);
    expect(
      (await t.http().get("/patron/reglages/lignes/x").set(t.auth(superviseurAkwa))).status,
    ).toBe(403);
  });

  it("ne laisse que le patron écrire sur les bus", async () => {
    const corps = { immatriculation: "LT 100 AA", capacite: 60, classe: "classique" };
    expect(
      (await t.http().post("/admin/bus").set(t.auth(superviseurAkwa)).send(corps)).status,
    ).toBe(403);
    expect((await t.http().get("/admin/bus").set(t.auth(superviseurAkwa))).status).toBe(200);
  });
});

describe("création d'une ligne (/patron/reglages/lignes)", () => {
  it("exige la signature PIN, et un PIN juste", async () => {
    const sans = await creerLigne({ signature: undefined });
    expect(sans.status).toBe(401);
    expect(sans.body.code).toBe("PIN_REQUIS");
    const faux = await creerLigne({ signature: t.signature("000000") });
    expect(faux.status).toBe(403);
    expect(faux.body.code).toBe("PIN_INCORRECT");
    expect((await t.http().get("/admin/lignes").set(t.auth(patronJeton))).body).toEqual([]);
  });

  it("refuse un corps qui n'est pas celui des contrats (champ inconnu, tarif négatif)", async () => {
    const inconnu = await creerLigne({ couleur: "rouge" });
    expect(inconnu.status).toBe(422);
    expect(inconnu.body.code).toBe("COMMANDE_INVALIDE");
    expect((await creerLigne({ tarifs: { ...TARIFS, vip: -1 } })).status).toBe(422);
    expect((await creerLigne({ capacite: 0 })).status).toBe(422);
  });

  it("crée la ligne entre deux gares : code, nom, arrêts au prorata, plan par défaut", async () => {
    const r = await creerLigne();
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const publiee = patron.LignePublieeSchema.parse(r.body);
    ligneId = publiee.ligne.id;
    expect(publiee.ligne.nom).toBe("Douala → Yaoundé");
    expect(publiee.ligne.tarifs).toEqual(TARIFS);
    expect(publiee.ligne.departs).toEqual([]);
    expect(publiee.ligne.plan).toEqual({ capacite: 70, disposition: "2+2", rangees: 18 });
    expect(publiee.ligne.options).toEqual({ venteEnLigne: true, fusionAuto: false });
    expect(publiee.ligne.arrets.map((a) => a.nom)).toEqual(["Édéa", "Makak"]);
    const [edea, makak] = publiee.ligne.arrets;
    expect(edea!.prorata).toBeGreaterThan(0);
    expect(makak!.prorata).toBeGreaterThan(edea!.prorata);
    expect(makak!.prorata).toBeLessThan(TARIFS.classique);
    expect(publiee.ligne.brouillon).toEqual({ modifications: 0, publicationA: null });
    expect(publiee.signePar).toBeTruthy();
    // La ligne figure au catalogue de l'agence, avec le code des deux gares.
    const liste = await t.http().get("/admin/lignes").set(t.auth(patronJeton));
    expect(liste.body).toHaveLength(1);
    expect(liste.body[0]).toMatchObject({ id: ligneId, code: "DLAYDE" });
    expect(liste.body[0].arrets).toEqual(["Douala", "Édéa", "Makak", "Yaoundé"]);
  });

  it("refuse une seconde ligne entre les mêmes gares, deux gares identiques, une gare d'une autre agence", async () => {
    const double = await creerLigne();
    expect(double.status).toBe(409);
    expect(double.body.code).toBe("LIGNE_EXISTANTE");
    const memeGare = await creerLigne({ destinationGareId: DOUALA_AKWA });
    expect(memeGare.status).toBe(422);
    expect(memeGare.body.code).toBe("GARES_IDENTIQUES");
    const etrangere = await creerLigne({ destinationGareId: GARE_AUTRE_AGENCE });
    expect(etrangere.status).toBe(404);
    expect(etrangere.body.code).toBe("GARE_INCONNUE");
    const arretDouble = await creerLigne({
      origineGareId: DOUALA_AKWA,
      destinationGareId: BAFOUSSAM,
      arrets: ["Édéa", "édéa"],
    });
    expect(arretDouble.status).toBe(422);
    expect(arretDouble.body.code).toBe("ARRET_EN_DOUBLE");
  });

  it("inscrit la création au journal d'audit, signature comprise", async () => {
    const journal = t.journalEnTexte();
    expect(journal).toContain("ligne.creer");
    expect(journal).not.toContain("482915");
  });
});

describe("lecture et publication (contrat patron)", () => {
  it("lit la ligne au format LigneEditable, et pas celle d'une autre agence", async () => {
    const r = await t.http().get(`/patron/reglages/lignes/${ligneId}`).set(t.auth(patronJeton));
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    patron.LigneEditableSchema.parse(r.body);
    const autre = await t
      .http()
      .get(`/patron/reglages/lignes/${ligneId}`)
      .set(t.auth(patronAutreAgence));
    expect(autre.status).toBe(404);
    expect(autre.body.code).toBe("LIGNE_INCONNUE");
    expect(
      (await modifierLigne({ tarifs: TARIFS }, patronAutreAgence)).status,
      "écrire sur la ligne d'une autre agence",
    ).toBe(404);
  });

  it("publie des horaires récurrents : le prix d'un départ vient du tarif de sa classe", async () => {
    const r = await modifierLigne({
      departs: [
        departEditable({ heure: "05:30" }),
        departEditable({ heure: "08:00", classe: "vip", prix: 1, jours: ["lun"] }),
      ],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const publiee = patron.LignePublieeSchema.parse(r.body);
    const departs = publiee.ligne.departs;
    expect(departs.map((d) => [d.heure, d.classe, d.prix, d.jours])).toEqual([
      ["05:30", "classique", 4000, []],
      ["08:00", "vip", 6000, ["lun"]],
    ]);
    expect(departs.every((d) => d.id !== null && !d.nouveau)).toBe(true);
    expect(publiee.ligne.brouillon.modifications).toBe(0);
  });

  it("refuse deux départs actifs à la même heure, un départ inconnu, une ligne qui n'est pas celle de l'URL", async () => {
    const lue = await t.http().get(`/patron/reglages/lignes/${ligneId}`).set(t.auth(patronJeton));
    const existants = lue.body.departs as Record<string, unknown>[];
    const double = await modifierLigne({
      departs: [...existants, departEditable({ heure: "05:30", classe: "vip" })],
    });
    expect(double.status).toBe(422);
    expect(double.body.code).toBe("HORAIRE_EN_DOUBLE");
    const inconnu = await modifierLigne({
      departs: [
        ...existants,
        departEditable({
          id: "00000000-0000-4000-8000-00000000dead",
          heure: "11:00",
          nouveau: false,
        }),
      ],
    });
    expect(inconnu.status).toBe(404);
    expect(inconnu.body.code).toBe("HORAIRE_INCONNU");
    const autreLigne = await t
      .http()
      .put(`/patron/reglages/lignes/${ligneId}`)
      .set(t.auth(patronJeton))
      .send({ ligneId: "autre", signature: t.signature() });
    expect(autreLigne.status).toBe(422);
    // Rien n'a bougé.
    const apres = await t.http().get(`/patron/reglages/lignes/${ligneId}`).set(t.auth(patronJeton));
    expect(apres.body.departs).toHaveLength(2);
  });

  it("change les tarifs tout de suite et recalcule les prix des départs et des arrêts", async () => {
    const avant = await t.http().get(`/patron/reglages/lignes/${ligneId}`).set(t.auth(patronJeton));
    const r = await modifierLigne({ tarifs: { classique: 5000, vip: 7500, bagage: 500 } });
    expect(r.status).toBe(200);
    const ligne = patron.LignePublieeSchema.parse(r.body).ligne;
    expect(ligne.departs.map((d) => d.prix)).toEqual([5000, 7500]);
    expect(ligne.arrets[0]!.prorata).toBeGreaterThan(avant.body.arrets[0].prorata);
    // On remet les tarifs d'origine pour la suite.
    await modifierLigne({ tarifs: TARIFS });
  });
});

describe("génération récurrente des départs", () => {
  const generer = (corps: Record<string, unknown>, jeton = patronJeton) =>
    t.http().post("/admin/departs/generer").set(t.auth(jeton)).send(corps);

  it("crée les départs de la semaine d'après les horaires et les jours de circulation, sans les heures passées", async () => {
    // Lundi 2 novembre, 9 h : les départs de 5 h 30 et de 8 h de ce lundi sont partis.
    const r = await generer({ ligneId, du: "2026-11-02", au: "2026-11-08" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ lignes: 1, passes: 2, dejaPresents: 0 });
    expect(r.body.crees).toHaveLength(6);
    const numeros = r.body.crees.map((d: { numero: string }) => d.numero);
    expect(numeros[0]).toBe("ALP-DLAYDE-261103-0530");
    expect(numeros).toContain("ALP-DLAYDE-261108-0530");
    expect(r.body.crees[0]).toMatchObject({ etat: "en_vente", classe: "classique", busId: null });
  });

  it("est rejouable : un second passage ne duplique rien", async () => {
    const r = await generer({ du: "2026-11-02", au: "2026-11-08" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ crees: [], dejaPresents: 6 });
    const jour = await t.http().get("/admin/departs?jour=2026-11-03").set(t.auth(patronJeton));
    expect(jour.body).toHaveLength(1);
    expect(jour.body[0]).toMatchObject({ numero: "ALP-DLAYDE-261103-0530", ligneCode: "DLAYDE" });
  });

  it("un horaire « lundi seulement » ne part que le lundi", async () => {
    const r = await generer({ ligneId, du: "2026-11-09", au: "2026-11-15" });
    const horaires = r.body.crees.map(
      (d: { heureDepart: string }) =>
        `${d.heureDepart.slice(0, 10)} ${d.heureDepart.slice(11, 16)}`,
    );
    expect(horaires.filter((h: string) => h.endsWith("08:00"))).toEqual(["2026-11-09 08:00"]);
    expect(horaires.filter((h: string) => h.endsWith("05:30"))).toHaveLength(7);
  });

  it("ouvre la vente par défaut, ou laisse le départ programmé", async () => {
    const r = await generer({ ligneId, du: "2026-11-16", au: "2026-11-16", ouvrirVente: false });
    expect(r.body.crees.length).toBeGreaterThan(0);
    expect(r.body.crees.every((d: { etat: string }) => d.etat === "programme")).toBe(true);
  });

  it("refuse un jour passé, une période à l'envers, trop longue, ou un jour qui n'existe pas", async () => {
    expect((await generer({ du: "2026-11-01", au: "2026-11-03" })).body.code).toBe("JOUR_PASSE");
    expect((await generer({ du: "2026-11-05", au: "2026-11-03" })).body.code).toBe(
      "PERIODE_INVALIDE",
    );
    expect((await generer({ du: "2026-11-02", au: "2027-03-01" })).body.code).toBe(
      "PERIODE_TROP_LONGUE",
    );
    expect((await generer({ du: "2026-02-30", au: "2026-11-03" })).body.code).toBe("JOUR_INVALIDE");
    expect((await generer({ du: "2026-11-02" })).status).toBe(422);
  });

  it("un superviseur ne génère que pour les lignes qui partent de sa gare", async () => {
    expect(
      (await generer({ ligneId, du: "2026-11-20", au: "2026-11-20" }, superviseurYaounde)).status,
    ).toBe(403);
    const r = await generer({ du: "2026-11-20", au: "2026-11-20" }, superviseurYaounde);
    expect(r.body).toMatchObject({ lignes: 0, crees: [] });
    const akwa = await generer({ du: "2026-11-20", au: "2026-11-20" }, superviseurAkwa);
    expect(akwa.body.lignes).toBe(1);
    expect(akwa.body.crees.length).toBeGreaterThan(0);
  });

  it("n'écrit rien dans l'agence voisine", async () => {
    const r = await generer({ du: "2026-11-20", au: "2026-11-20" }, patronAutreAgence);
    expect(r.body).toMatchObject({ lignes: 0, crees: [] });
    expect(
      (await t.http().get("/admin/departs?jour=2026-11-20").set(t.auth(patronAutreAgence))).body,
    ).toEqual([]);
  });
});

describe("modifications programmées « dès le … »", () => {
  it("garde un changement « dès lundi » en brouillon et l'applique de lui-même au jour dit", async () => {
    const lue = await t.http().get(`/patron/reglages/lignes/${ligneId}`).set(t.auth(patronJeton));
    const existants = lue.body.departs as Record<string, unknown>[];
    const r = await modifierLigne({
      departs: [...existants, departEditable({ heure: "12:00" })],
      effetDu: "2026-11-23",
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const ligne = patron.LignePublieeSchema.parse(r.body).ligne;
    expect(ligne.brouillon).toEqual({
      modifications: 1,
      publicationA: "2026-11-23T00:00:00.000+01:00",
    });
    // L'écran du patron voit son brouillon (le départ de midi, marqué nouveau)…
    expect(ligne.departs.find((d) => d.heure === "12:00")?.nouveau).toBe(true);
    // …mais la billetterie n'en tient pas compte avant le jour d'effet : aucun départ de midi le 22 novembre.
    const generation = await t
      .http()
      .post("/admin/departs/generer")
      .set(t.auth(patronJeton))
      .send({ du: "2026-11-22", au: "2026-11-22" });
    expect(generation.status).toBe(200);
    expect(
      generation.body.crees.map((d: { heureDepart: string }) => d.heureDepart.slice(11, 16)),
    ).toEqual(["05:30"]);
    // Le 23 novembre, le départ de midi existe, et le brouillon s'est publié.
    const generation9 = await t
      .http()
      .post("/admin/departs/generer")
      .set(t.auth(patronJeton))
      .send({ du: "2026-11-23", au: "2026-11-23" });
    expect(
      generation9.body.crees.map((d: { heureDepart: string }) => d.heureDepart.slice(11, 16)),
    ).toEqual(["05:30", "08:00", "12:00"]);
    t.horloge.avancer(21 * 24 * 3_600_000);
    const apres = await t.http().get(`/patron/reglages/lignes/${ligneId}`).set(t.auth(patronJeton));
    expect(apres.body.brouillon).toEqual({ modifications: 0, publicationA: null });
    expect(apres.body.departs.find((d: { heure: string }) => d.heure === "12:00")).toMatchObject({
      nouveau: false,
    });
    expect(t.journalEnTexte()).toContain("ligne.brouillon_applique");
    t.horloge.avancer(-21 * 24 * 3_600_000);
  });
});

describe("départs à l'unité, bus et équipages", () => {
  let busId: string;
  let departMatin: { id: string; numero: string };
  let departChevauchant: { id: string };

  it("ajoute un bus (immatriculation normalisée, unique par agence)", async () => {
    const r = await t.http().post("/admin/bus").set(t.auth(patronJeton)).send({
      immatriculation: "  lt 123  ab ",
      capacite: 70,
      capaciteSoute: 20,
      classe: "classique",
      modele: "Yutong",
      annee: 2022,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({
      immatriculation: "LT 123 AB",
      capacite: 70,
      capaciteSoute: 20,
      classe: "classique",
    });
    busId = r.body.id;
    const double = await t
      .http()
      .post("/admin/bus")
      .set(t.auth(patronJeton))
      .send({ immatriculation: "LT 123 AB", capacite: 50, classe: "vip" });
    expect(double.status).toBe(409);
    expect(double.body.code).toBe("BUS_EXISTANT");
    // L'agence voisine peut avoir la même plaque.
    const voisin = await t
      .http()
      .post("/admin/bus")
      .set(t.auth(patronAutreAgence))
      .send({ immatriculation: "LT 123 AB", capacite: 50, classe: "vip" });
    expect(voisin.status).toBe(201);
    expect((await t.http().get("/admin/bus").set(t.auth(patronJeton))).body).toHaveLength(1);
  });

  it("refuse une fiche de bus invalide", async () => {
    for (const corps of [
      { immatriculation: "LT 1 AB", capacite: 0, classe: "classique" },
      { immatriculation: "LT 1 AB", capacite: 50, classe: "luxe" },
      { immatriculation: "!!", capacite: 50, classe: "vip" },
      { immatriculation: "LT 1 AB", capacite: 50, classe: "vip", extra: 1 },
    ]) {
      expect((await t.http().post("/admin/bus").set(t.auth(patronJeton)).send(corps)).status).toBe(
        422,
      );
    }
  });

  it("crée un départ à l'unité : numéro, état, heure à venir exigée", async () => {
    const matin = await t
      .http()
      .post("/admin/departs")
      .set(t.auth(patronJeton))
      .send({ ligneId, heureDepart: "2026-12-01T06:00:00.000+01:00" });
    expect(matin.status, JSON.stringify(matin.body)).toBe(201);
    expect(matin.body).toMatchObject({
      numero: "ALP-DLAYDE-261201-0600",
      etat: "en_vente",
      classe: "classique",
    });
    departMatin = matin.body;
    const chevauche = await t
      .http()
      .post("/admin/departs")
      .set(t.auth(patronJeton))
      .send({ ligneId, heureDepart: "2026-12-01T08:00:00.000+01:00", classe: "vip" });
    expect(chevauche.status).toBe(201);
    departChevauchant = chevauche.body;
    const double = await t
      .http()
      .post("/admin/departs")
      .set(t.auth(patronJeton))
      .send({ ligneId, heureDepart: "2026-12-01T06:00:00.000+01:00" });
    expect(double.status).toBe(409);
    expect(double.body.code).toBe("DEPART_EXISTANT");
    const passe = await t
      .http()
      .post("/admin/departs")
      .set(t.auth(patronJeton))
      .send({ ligneId, heureDepart: "2026-11-02T08:00:00.000+01:00" });
    expect(passe.status).toBe(422);
    expect(passe.body.code).toBe("HEURE_PASSEE");
  });

  it("affecte le bus et le quai, puis refuse le même bus sur un départ qui chevauche", async () => {
    const r = await t
      .http()
      .patch(`/admin/departs/${departMatin.id}/equipage`)
      .set(t.auth(patronJeton))
      .send({ busId, quai: 3 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ busId, quai: 3 });
    const conflit = await t
      .http()
      .patch(`/admin/departs/${departChevauchant.id}/equipage`)
      .set(t.auth(patronJeton))
      .send({ busId });
    expect(conflit.status).toBe(409);
    expect(conflit.body.code).toBe("RESSOURCE_OCCUPEE");
    expect(conflit.body.message).toContain(departMatin.numero);
    // À la création aussi : le bus ne peut pas partir deux fois en même temps.
    const creation = await t
      .http()
      .post("/admin/departs")
      .set(t.auth(patronJeton))
      .send({ ligneId, heureDepart: "2026-12-01T07:00:00.000+01:00", busId });
    expect(creation.status).toBe(409);
    // Libéré du premier départ, le bus peut partir sur l'autre.
    await t
      .http()
      .patch(`/admin/departs/${departMatin.id}/equipage`)
      .set(t.auth(patronJeton))
      .send({ busId: null });
    const libre = await t
      .http()
      .patch(`/admin/departs/${departChevauchant.id}/equipage`)
      .set(t.auth(patronJeton))
      .send({ busId });
    expect(libre.status).toBe(200);
    await t
      .http()
      .patch(`/admin/departs/${departChevauchant.id}/equipage`)
      .set(t.auth(patronJeton))
      .send({ busId: null });
  });

  it("affecte un chauffeur et un convoyeur qui ont le bon rôle, dans la bonne agence", async () => {
    const chauffeur = await t.compte("chauffeur");
    const convoyeur = await t.compte("convoyeur");
    const guichetier = await t.compte("guichetier");
    const etranger = await t.compte("chauffeur", { compagnieId: AUTRE_AGENCE });
    const equiper = (corps: Record<string, unknown>) =>
      t
        .http()
        .patch(`/admin/departs/${departMatin.id}/equipage`)
        .set(t.auth(patronJeton))
        .send(corps);
    const ok = await equiper({ chauffeurId: chauffeur.id, convoyeurId: convoyeur.id });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ chauffeurId: chauffeur.id, convoyeurId: convoyeur.id });
    expect((await equiper({ chauffeurId: guichetier.id })).body.code).toBe("ROLE_INCOMPATIBLE");
    expect((await equiper({ convoyeurId: chauffeur.id })).body.code).toBe("ROLE_INCOMPATIBLE");
    expect((await equiper({ chauffeurId: etranger.id })).body.code).toBe("PERSONNE_INCONNUE");
    expect((await equiper({ busId: "00000000-0000-4000-8000-00000000b0b0" })).body.code).toBe(
      "BUS_INCONNU",
    );
    // Le même chauffeur ne conduit pas deux départs qui se chevauchent.
    const conflit = await t
      .http()
      .patch(`/admin/departs/${departChevauchant.id}/equipage`)
      .set(t.auth(patronJeton))
      .send({ chauffeurId: chauffeur.id });
    expect(conflit.status).toBe(409);
    expect(conflit.body.message).toContain("chauffeur");
  });

  it("ne change plus le bus d'un départ qui a des billets vendus, ni les places d'un bus qui a des départs à venir", async () => {
    t.programmeMemoire.poserBilletsVendus(departMatin.id, 3);
    const bus2 = await t
      .http()
      .post("/admin/bus")
      .set(t.auth(patronJeton))
      .send({ immatriculation: "LT 456 CD", capacite: 60, classe: "classique" });
    const billets = await t
      .http()
      .patch(`/admin/departs/${departMatin.id}/equipage`)
      .set(t.auth(patronJeton))
      .send({ busId: bus2.body.id });
    expect(billets.status).toBe(409);
    expect(billets.body.code).toBe("BILLETS_VENDUS");
    // Le chauffeur, lui, peut encore changer.
    const quai = await t
      .http()
      .patch(`/admin/departs/${departMatin.id}/equipage`)
      .set(t.auth(patronJeton))
      .send({ quai: 5 });
    expect(quai.status).toBe(200);

    t.programmeMemoire.poserBilletsVendus(departMatin.id, 0);
    await t
      .http()
      .patch(`/admin/departs/${departMatin.id}/equipage`)
      .set(t.auth(patronJeton))
      .send({ busId });
    const places = await t
      .http()
      .patch(`/admin/bus/${busId}`)
      .set(t.auth(patronJeton))
      .send({ capacite: 55 });
    expect(places.status).toBe(409);
    expect(places.body.code).toBe("BUS_AFFECTE");
    const modele = await t
      .http()
      .patch(`/admin/bus/${busId}`)
      .set(t.auth(patronJeton))
      .send({ modele: "King Long" });
    expect(modele.status).toBe(200);
    expect(modele.body.modele).toBe("King Long");
    const prise = await t
      .http()
      .patch(`/admin/bus/${busId}`)
      .set(t.auth(patronJeton))
      .send({ immatriculation: "lt 456 cd" });
    expect(prise.status).toBe(409);
    expect(prise.body.code).toBe("BUS_EXISTANT");
  });

  it("répond 404 sur un départ, un bus ou un bus d'une autre agence", async () => {
    expect(
      (
        await t
          .http()
          .patch("/admin/departs/00000000-0000-4000-8000-00000000dead/equipage")
          .set(t.auth(patronJeton))
          .send({ quai: 1 })
      ).status,
    ).toBe(404);
    expect(
      (
        await t
          .http()
          .patch(`/admin/departs/${departMatin.id}/equipage`)
          .set(t.auth(patronAutreAgence))
          .send({ quai: 1 })
      ).status,
    ).toBe(404);
    const autre = await t.app.get(ParcBus).creer({
      compagnieId: AUTRE_AGENCE,
      immatriculation: "ZZ 1",
      capacite: 40,
      capaciteSoute: 0,
      classe: "classique",
      modele: "",
      annee: 0,
    });
    expect(
      (
        await t
          .http()
          .patch(`/admin/bus/${autre!.id}`)
          .set(t.auth(patronJeton))
          .send({ modele: "x" })
      ).status,
    ).toBe(404);
    expect(
      (
        await t
          .http()
          .patch(`/admin/departs/${departMatin.id}/equipage`)
          .set(t.auth(patronJeton))
          .send({ busId: autre!.id })
      ).body.code,
    ).toBe("BUS_INCONNU");
  });

  it("un superviseur n'équipe que les départs de sa gare", async () => {
    const hors = await t
      .http()
      .patch(`/admin/departs/${departMatin.id}/equipage`)
      .set(t.auth(superviseurYaounde))
      .send({ quai: 2 });
    expect(hors.status).toBe(403);
    expect(hors.body.code).toBe("HORS_PERIMETRE");
    const chez = await t
      .http()
      .patch(`/admin/departs/${departMatin.id}/equipage`)
      .set(t.auth(superviseurAkwa))
      .send({ quai: 2 });
    expect(chez.status).toBe(200);
    expect(
      (await t.http().get("/admin/departs?jour=2026-12-01").set(t.auth(superviseurYaounde))).body,
    ).toEqual([]);
    expect(
      (await t.http().get("/admin/departs?jour=2026-12-01").set(t.auth(superviseurAkwa))).body,
    ).toHaveLength(2);
  });

  it("refuse un jour mal écrit dans la liste des départs", async () => {
    expect((await t.http().get("/admin/departs?jour=demain").set(t.auth(patronJeton))).status).toBe(
      422,
    );
  });
});

describe("agences", () => {
  it("liste les gares de l'agence et seulement les siennes", async () => {
    const r = await t.http().get("/admin/gares").set(t.auth(patronJeton));
    expect(r.body.map((g: { code: string }) => g.code).sort()).toEqual(["BFM", "DLA", "YDE"]);
    const autre = await t.http().get("/admin/gares").set(t.auth(patronAutreAgence));
    expect(autre.body).toHaveLength(1);
    expect(autre.body[0].compagnieId).toBe(AUTRE_AGENCE);
    expect(AGENCE).not.toBe(AUTRE_AGENCE);
  });
});
