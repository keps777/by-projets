import { patron } from "@afrimove/contrats";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ReglesAgence } from "../caisse/ports";
import { FixturesPg, type GareFixture } from "../caisse/testing/fixtures-pg";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { SmsGateway, SmsMock } from "../socle/sms/sms.gateway";
import { creerAppPg, entetePg, type AppPg } from "../socle/testing/app-pg";
import {
  preparerBaseDeTest,
  URL_BASE_TEST,
  type BaseDeTest,
} from "../socle/testing/base-integration";
import { CONTEXTE_MOMO_AGENCE } from "./reglages.service";

/**
 * L'espace patron sur PostgreSQL, par l'API entière (`API_STOCKAGE=postgres`) : les lectures agrègent les
 * tables des autres modules, les écritures de réglages tiennent dans les tables du lot (migrations
 * 20261018001000 et 20261018001010), la caisse lit la nouvelle tolérance, un compte désactivé ne passe plus,
 * et les garde-fous SQL refusent ce que l'API n'écrirait jamais.
 */
describe.skipIf(!URL_BASE_TEST)("PostgreSQL réel · espace patron, l'API de bout en bout", () => {
  let base: BaseDeTest;
  let sql: Client;
  let t: AppPg;
  let fx: FixturesPg;
  let prisma: PrismaService;
  let sms: SmsMock;
  let chiffrement: ChiffrementService;

  let compagnieId: string;
  let akwa: GareFixture;
  let mvan: GareFixture;
  let ligneId: string;
  let jeton: string;
  let patronId: string;
  let autreCompagnie: { id: string; gare: GareFixture; personneId: string };

  const auth = entetePg;
  const signature = (decalageMs = 0) => ({
    pin: "482915",
    methode: "pin" as const,
    signeA: new Date(t.horloge.maintenant().getTime() + decalageMs + 3_600_000)
      .toISOString()
      .replace("Z", "+01:00"),
  });
  const erreurSql = async (texte: string, valeurs: unknown[] = []): Promise<string> => {
    try {
      await sql.query(texte, valeurs);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };
  const depart = (id: string | null, heure: string, extra: Record<string, unknown> = {}) => ({
    id,
    heure,
    heureInitiale: null,
    classe: "classique" as const,
    prix: 8000,
    actif: true,
    note: null,
    jours: [] as string[],
    nouveau: id === null,
    ...extra,
  });
  const droits = {
    vendreBilletsEtColis: true,
    annulerSansPinSuperviseur: false,
    modeCadence: false,
    voirCaissesDesAutres: false,
  };

  beforeAll(async () => {
    base = await preparerBaseDeTest();
    sql = base.sql;
    t = await creerAppPg({ url: base.url });
    prisma = t.prisma;
    fx = new FixturesPg(prisma);
    sms = t.resoudre(SmsGateway) as SmsMock;
    chiffrement = t.resoudre(ChiffrementService);

    const compagnie = await fx.compagnie();
    compagnieId = compagnie.id;
    akwa = await fx.gare(compagnieId, { nom: "Akwa", ville: "Douala" });
    mvan = await fx.gare(compagnieId, { nom: "Mvan", ville: "Yaoundé" });
    const g1 = await fx.guichet(akwa.id, 1);
    await fx.guichet(akwa.id, 2);
    ligneId = (await fx.ligne(compagnieId, akwa.id, mvan.id)).id;
    const bus = await fx.bus(compagnieId);
    const dep = await fx.depart(ligneId, {
      heureDepart: new Date("2027-01-04T14:00:00.000Z"),
      busId: bus.id,
    });
    const aujourdhui = new Date("2027-01-04T07:00:00.000Z");
    const contexte = { compagnieId, gareId: akwa.id, departId: dep.id };
    await fx.billet(contexte, { prix: 8000, creeA: aujourdhui, guichetId: g1.id });
    await fx.billet(contexte, { prix: 5000, creeA: aujourdhui, guichetId: g1.id });
    await fx.billet(contexte, { prix: 9000, creeA: aujourdhui, etat: "annule" });

    const p = await t.compte("patron", { compagnieId, nom: "Patron Test" });
    jeton = p.jeton;
    patronId = p.id;
    await fx.personne({ nom: "Éric Ngono", roles: ["guichetier"], compagnieId, gareId: akwa.id });

    const autre = await fx.compagnie();
    const gareAutre = await fx.gare(autre.id, { nom: "Bonabéri" });
    const personneAutre = await fx.personne({
      nom: "Marie Autre",
      roles: ["guichetier"],
      compagnieId: autre.id,
      gareId: gareAutre.id,
    });
    autreCompagnie = { id: autre.id, gare: gareAutre, personneId: personneAutre.id };
  }, 180_000);

  afterAll(async () => {
    await t?.fermer();
    await base?.fermer();
  });

  describe("lectures", () => {
    it("le tableau du jour additionne les billets payés du jour, sans les annulés", async () => {
      const r = await t.http().get("/patron/aujourdhui").set(auth(jeton));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const lu = patron.TableauDuJourSchema.parse(r.body);
      expect(lu.jour.billets).toBe(2);
      expect(lu.jour.recette).toBe(13_000);
      expect(lu.nbGares).toBe(2);
      expect(lu.nbBus).toBe(1);
    });

    it("alertes, gares, équipe, fiche et salle de contrôle suivent les contrats", async () => {
      patron.ListeAlertesSchema.parse(
        (await t.http().get("/patron/alertes").set(auth(jeton))).body,
      );
      const gares = patron.VueGaresSchema.parse(
        (await t.http().get("/patron/gares").set(auth(jeton))).body,
      );
      expect(gares.gares.map((g) => g.nom).sort()).toEqual(["Akwa", "Mvan"]);
      const detail = await t.http().get(`/patron/gares/${akwa.id}`).set(auth(jeton));
      expect(detail.status, JSON.stringify(detail.body)).toBe(200);
      patron.DetailGareSchema.parse(detail.body);
      const equipe = patron.ListeEquipeSchema.parse(
        (await t.http().get("/patron/equipe").set(auth(jeton))).body,
      );
      const eric = equipe.personnes.find((x) => x.nom.startsWith("Éric"));
      expect(eric).toBeDefined();
      const fiche = await t.http().get(`/patron/personnes/${eric!.id}`).set(auth(jeton));
      expect(fiche.status, JSON.stringify(fiche.body)).toBe(200);
      patron.FichePersonneSchema.parse(fiche.body);
      const salle = await t.http().get("/patron/controle").set(auth(jeton));
      expect(salle.status, JSON.stringify(salle.body)).toBe(200);
      patron.SalleDeControleSchema.parse(salle.body);
    });

    it("une compagnie ne voit ni les gares, ni les personnes, ni les lignes d'une autre", async () => {
      expect(
        (await t.http().get(`/patron/gares/${autreCompagnie.gare.id}`).set(auth(jeton))).status,
      ).toBe(404);
      expect(
        (await t.http().get(`/patron/personnes/${autreCompagnie.personneId}`).set(auth(jeton)))
          .status,
      ).toBe(404);
      expect(
        (
          await t
            .http()
            .get(`/patron/reglages/personnes/${autreCompagnie.personneId}`)
            .set(auth(jeton))
        ).status,
      ).toBe(404);
      const equipe = patron.ListeEquipeSchema.parse(
        (await t.http().get("/patron/equipe").set(auth(jeton))).body,
      );
      expect(equipe.personnes.map((x) => x.nom)).not.toContain("Marie A.");
      // Écrire sur une personne d'une autre compagnie : 404, et rien n'est écrit.
      const r = await t
        .http()
        .post(`/patron/reglages/personnes/${autreCompagnie.personneId}/desactivation`)
        .set(auth(jeton))
        .send({ personneId: autreCompagnie.personneId, signature: signature() });
      expect(r.status).toBe(404);
      expect(
        (await prisma.personne.findUniqueOrThrow({ where: { id: autreCompagnie.personneId } }))
          .actif,
      ).toBe(true);
    });

    it("refuse un autre rôle que le patron", async () => {
      const g = await t.compte("guichetier", { compagnieId, gareId: akwa.id });
      expect((await t.http().get("/patron/aujourdhui").set(auth(g.jeton))).status).toBe(403);
      expect((await t.http().get("/patron/aujourdhui")).status).toBe(401);
    });
  });

  describe("règles de l'agence", () => {
    const regles = {
      annulation: {
        gratuiteJusqua: "2h_avant",
        retenue: "dix_pct",
        retenueParClassePct: { classique: 10, vip: 30 },
      },
      caisse: { toleranceEcart: 2500, auDela: "bloque_guichet" },
      cadence: { numeroObligatoire: true },
      fraisService: { montant: 300, priseEnChargeParAgence: true },
    };

    it("sans signature : 401 et rien n'est écrit", async () => {
      const r = await t.http().put("/patron/reglages/regles").set(auth(jeton)).send({ regles });
      expect(r.status).toBe(401);
      expect(await prisma.reglesCompagnie.count({ where: { compagnieId } })).toBe(0);
    });

    it("écrit les règles et la tolérance d'un seul tenant ; la caisse lit la nouvelle tolérance", async () => {
      const avant = patron.ReglesAgenceSchema.parse(
        (await t.http().get("/patron/reglages/regles").set(auth(jeton))).body,
      );
      expect(avant.caisse.toleranceEcart).toBe(1000);

      const r = await t
        .http()
        .put("/patron/reglages/regles")
        .set(auth(jeton))
        .send({ regles, signature: signature() });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      patron.ReglesEnregistreesSchema.parse(r.body);

      const ligne = await prisma.reglesCompagnie.findUniqueOrThrow({ where: { compagnieId } });
      expect(ligne).toMatchObject({
        gratuiteJusqua: "2h_avant",
        retenue: "dix_pct",
        retenueVipPct: 30,
        auDela: "bloque_guichet",
      });
      expect(
        (await prisma.compagnie.findUniqueOrThrow({ where: { id: compagnieId } }))
          .toleranceEcartCaisse,
      ).toBe(2500);
      expect(await t.resoudre(ReglesAgence).tolerance(compagnieId)).toBe(2500);
      const relu = patron.ReglesAgenceSchema.parse(
        (await t.http().get("/patron/reglages/regles").set(auth(jeton))).body,
      );
      expect(relu.cadence.numeroObligatoire).toBe(true);
      expect(relu.fraisService.montant).toBe(300);
    });

    it("trace l'écriture dans le journal d'audit, sans le PIN", async () => {
      const lignes = await prisma.journalAudit.findMany({
        where: { compagnieId, action: "reglages.regles_modifiees" },
      });
      expect(lignes.length).toBeGreaterThan(0);
      expect(lignes.every((l) => l.acteurId === patronId)).toBe(true);
      expect(
        JSON.stringify(lignes, (_c, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
      ).not.toContain("482915");
    });

    it("une tolérance négative est refusée par la base même écrite à la main", async () => {
      expect(
        await erreurSql(
          `UPDATE regles_compagnie SET "retenueVipPct" = 101 WHERE "compagnieId" = $1`,
          [compagnieId],
        ),
      ).toMatch(/regles_compagnie_pourcentages/);
      expect(
        await erreurSql(`UPDATE regles_compagnie SET "retenue" = 'tout' WHERE "compagnieId" = $1`, [
          compagnieId,
        ]),
      ).toMatch(/regles_compagnie_retenue_connue/);
    });
  });

  describe("lignes", () => {
    const url = () => `/patron/reglages/lignes/${ligneId}`;

    it("publie tarifs, arrêts, départs, plan et options, puis les relit", async () => {
      const r = await t
        .http()
        .put(url())
        .set(auth(jeton))
        .send({
          ligneId,
          tarifs: { classique: 8500, vip: 12_500, bagage: 600 },
          arrets: [
            { nom: "Édéa", montee: true },
            { nom: "Makak", montee: false },
          ],
          departs: [
            depart(null, "06:00", { prix: 8500 }),
            depart(null, "09:15", { prix: 8500, note: "soute colis" }),
          ],
          plan: { capacite: 40, disposition: "2+2", rangees: 10 },
          options: { venteEnLigne: true, fusionAuto: true },
          signature: signature(),
        });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const lu = patron.LignePublieeSchema.parse(r.body);
      expect(lu.ligne.tarifs.classique).toBe(8500);
      expect(lu.ligne.departs.map((d) => d.heure)).toEqual(["06:00", "09:15"]);

      const base = await prisma.ligne.findUniqueOrThrow({ where: { id: ligneId } });
      expect(base.tarifClassique).toBe(8500);
      expect(await prisma.ligneHoraire.count({ where: { ligneId } })).toBe(2);
      expect(await prisma.ligneReglage.findUniqueOrThrow({ where: { ligneId } })).toMatchObject({
        disposition: "2+2",
        rangees: 10,
        fusionAuto: true,
      });
      const relu = patron.LigneEditableSchema.parse(
        (await t.http().get(url()).set(auth(jeton))).body,
      );
      expect(relu.arrets.map((a) => a.nom)).toContain("Édéa");
      expect(relu.departs).toHaveLength(2);
    });

    it("refuse deux départs identiques, un départ d'une autre ligne et une ligne d'une autre compagnie", async () => {
      const doublon = await t
        .http()
        .put(url())
        .set(auth(jeton))
        .send({
          ligneId,
          departs: [depart(null, "07:00"), depart(null, "07:00")],
          signature: signature(),
        });
      expect(doublon.status).toBe(422);
      expect(doublon.body.code).toBe("DEPART_EN_DOUBLE");
      expect(await prisma.ligneHoraire.count({ where: { ligneId } })).toBe(2);

      const autreLigne = await fx.ligne(
        autreCompagnie.id,
        autreCompagnie.gare.id,
        (await fx.gare(autreCompagnie.id)).id,
      );
      const r = await t
        .http()
        .put(`/patron/reglages/lignes/${autreLigne.id}`)
        .set(auth(jeton))
        .send({
          ligneId: autreLigne.id,
          tarifs: { classique: 1, vip: 1, bagage: 1 },
          signature: signature(),
        });
      expect(r.status).toBe(404);
    });

    it("une modification « dès lundi » reste en brouillon, puis entre en vigueur au jour dit", async () => {
      const lundi = "2027-01-11";
      const r = await t
        .http()
        .put(url())
        .set(auth(jeton))
        .send({
          ligneId,
          tarifs: { classique: 7000, vip: 11_000, bagage: 500 },
          effetDu: lundi,
          signature: signature(),
        });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const lu = patron.LignePublieeSchema.parse(r.body);
      expect(lu.ligne.tarifs.classique).toBe(8500);
      expect(lu.ligne.brouillon.modifications).toBe(1);
      const reglage = await prisma.ligneReglage.findUniqueOrThrow({ where: { ligneId } });
      expect(reglage.brouillon).not.toBeNull();
      expect(reglage.effetDu?.toISOString().slice(0, 10)).toBe(lundi);
      expect(
        await erreurSql(`UPDATE ligne_reglage SET "effetDu" = NULL WHERE "ligneId" = $1`, [
          ligneId,
        ]),
      ).toMatch(/ligne_reglage_brouillon_et_effet/);

      t.horloge.avancer(7 * 24 * 3_600_000);
      try {
        const apres = patron.LigneEditableSchema.parse(
          (await t.http().get(url()).set(auth(jeton))).body,
        );
        expect(apres.tarifs.classique).toBe(7000);
        expect(apres.brouillon.modifications).toBe(0);
        const fin = await prisma.ligneReglage.findUniqueOrThrow({ where: { ligneId } });
        expect(fin.brouillon).toBeNull();
        expect(fin.effetDu).toBeNull();
        expect(
          (await prisma.ligne.findUniqueOrThrow({ where: { id: ligneId } })).tarifClassique,
        ).toBe(7000);
      } finally {
        t.horloge.avancer(-7 * 24 * 3_600_000);
      }
    });

    it("crée une ligne entre deux gares, une seule fois même à deux requêtes simultanées", async () => {
      const corps = () => ({
        origineGareId: mvan.id,
        destinationGareId: akwa.id,
        tarifs: { classique: 8000, vip: 12_000, bagage: 500 },
        arrets: ["Édéa"],
        capacite: 40,
        signature: signature(),
      });
      const reponses = await Promise.all([
        t.http().post("/patron/reglages/lignes").set(auth(jeton)).send(corps()),
        t.http().post("/patron/reglages/lignes").set(auth(jeton)).send(corps()),
      ]);
      expect(
        reponses.map((r) => r.status).sort(),
        JSON.stringify(reponses.map((r) => r.body)),
      ).toEqual([201, 409]);
      const cree = reponses.find((r) => r.status === 201)!;
      const lu = patron.LignePublieeSchema.parse(cree.body);
      expect(lu.ligne.nom).toBe("Yaoundé → Douala");
      expect(
        await prisma.ligne.count({
          where: { compagnieId, origineGareId: mvan.id, destinationGareId: akwa.id },
        }),
      ).toBe(1);
    });

    it("la base refuse une heure, un jour ou une disposition mal formés", async () => {
      const [h] = await prisma.ligneHoraire.findMany({ where: { ligneId }, take: 1 });
      expect(
        await erreurSql(`UPDATE ligne_horaire SET heure = '25:00' WHERE id = $1`, [h!.id]),
      ).toMatch(/ligne_horaire_heure_forme/);
      expect(
        await erreurSql(`UPDATE ligne_horaire SET jours = ARRAY['xxx'] WHERE id = $1`, [h!.id]),
      ).toMatch(/ligne_horaire_jours_connus/);
      expect(
        await erreurSql(`UPDATE ligne_reglage SET disposition = 'deux' WHERE "ligneId" = $1`, [
          ligneId,
        ]),
      ).toMatch(/ligne_reglage_disposition_forme/);
    });
  });

  describe("équipe", () => {
    const champs = (extra: Record<string, unknown> = {}) => ({
      nom: "Alice Nkeng",
      telephone: "+237677112233",
      operateur: "Orange" as const,
      role: "guichetier" as const,
      gareId: akwa.id,
      guichet: "1",
      salaire: 85_000,
      droits,
      ...extra,
    });
    let aliceId = "";

    it("crée une personne : compte, réglages et PIN provisoire par SMS, jamais dans la réponse ni l'audit", async () => {
      const r = await t
        .http()
        .post("/patron/reglages/personnes")
        .set(auth(jeton))
        .send({ champs: champs(), signature: signature() });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const lu = patron.PersonneEnregistreeSchema.parse(r.body);
      expect(lu.pinProvisoireEnvoye).toBe(true);
      aliceId = lu.personne.id;

      const personne = await prisma.personne.findUniqueOrThrow({ where: { id: aliceId } });
      expect(personne).toMatchObject({ compagnieId, gareId: akwa.id, actif: true });
      expect(personne.roles).toEqual(["guichetier"]);
      expect(personne.guichetId).not.toBeNull();
      expect(personne.pinHache).not.toBeNull();
      expect(personne.pinProvisoireJusqua).not.toBeNull();
      expect(personne.telephoneChiffre).not.toContain("677112233");
      expect(
        await prisma.personneReglage.findUniqueOrThrow({ where: { personneId: aliceId } }),
      ).toMatchObject({
        operateur: "Orange",
        salaire: 85_000,
      });

      const message = sms.dernier();
      expect(message?.telephone).toBe("+237677112233");
      const pin = /PIN provisoire est (\d{6})/.exec(message?.message ?? "")?.[1];
      expect(pin).toBeDefined();
      expect(JSON.stringify(r.body)).not.toContain(pin!);
      const audit = JSON.stringify(
        await prisma.journalAudit.findMany({ where: { compagnieId } }),
        (_c, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
      );
      expect(audit).not.toContain(pin!);
      expect(audit).not.toContain("677112233");
    });

    it("le même numéro ne sert pas deux fois, même à deux requêtes simultanées", async () => {
      const doublon = await t
        .http()
        .post("/patron/reglages/personnes")
        .set(auth(jeton))
        .send({ champs: champs(), signature: signature() });
      expect(doublon.status).toBe(409);
      expect(doublon.body.code).toBe("TELEPHONE_DEJA_UTILISE");
      const neuf = () => ({
        champs: champs({ nom: "Bob Mbarga", telephone: "+237677998811" }),
        signature: signature(),
      });
      const rs = await Promise.all([
        t.http().post("/patron/reglages/personnes").set(auth(jeton)).send(neuf()),
        t.http().post("/patron/reglages/personnes").set(auth(jeton)).send(neuf()),
      ]);
      expect(rs.map((x) => x.status).sort(), JSON.stringify(rs.map((x) => x.body))).toEqual([
        201, 409,
      ]);
    });

    it("refuse un guichetier sans gare et la gare d'une autre compagnie", async () => {
      const sansGare = await t
        .http()
        .post("/patron/reglages/personnes")
        .set(auth(jeton))
        .send({
          champs: champs({ gareId: null, guichet: null, telephone: "+237677445566" }),
          signature: signature(),
        });
      expect(sansGare.status).toBe(422);
      const gareAutre = await t
        .http()
        .post("/patron/reglages/personnes")
        .set(auth(jeton))
        .send({
          champs: champs({ gareId: autreCompagnie.gare.id, telephone: "+237677445577" }),
          signature: signature(),
        });
      expect(gareAutre.status).toBe(404);
    });

    it("modifie la personne : salaire, droits et affectation tiennent en base", async () => {
      const r = await t
        .http()
        .put(`/patron/reglages/personnes/${aliceId}`)
        .set(auth(jeton))
        .send({
          personneId: aliceId,
          champs: { salaire: 90_000, droits: { ...droits, modeCadence: true }, guichet: "2" },
          signature: signature(),
        });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const reglage = await prisma.personneReglage.findUniqueOrThrow({
        where: { personneId: aliceId },
      });
      expect(reglage.salaire).toBe(90_000);
      expect((reglage.droits as { modeCadence: boolean }).modeCadence).toBe(true);
      const relu = patron.PersonneEditableSchema.parse(
        (await t.http().get(`/patron/reglages/personnes/${aliceId}`).set(auth(jeton))).body,
      );
      expect(relu.salaire).toBe(90_000);
      expect(relu.guichet).toBe("2");
    });

    it("envoie un nouveau PIN provisoire, puis désactive le compte : son jeton ne passe plus", async () => {
      const avant = sms.messages().length;
      const pinR = await t
        .http()
        .post(`/patron/reglages/personnes/${aliceId}/pin-provisoire`)
        .set(auth(jeton))
        .send({ personneId: aliceId, signature: signature() });
      expect(pinR.status, JSON.stringify(pinR.body)).toBe(200);
      expect(sms.messages().length).toBe(avant + 1);

      const cible = await t.compte("guichetier", { compagnieId, gareId: akwa.id });
      expect((await t.http().get("/patron/aujourdhui").set(auth(cible.jeton))).status).toBe(403);
      const r = await t
        .http()
        .post(`/patron/reglages/personnes/${cible.id}/desactivation`)
        .set(auth(jeton))
        .send({ personneId: cible.id, signature: signature() });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      patron.PersonneDesactiveeSchema.parse(r.body);
      expect((await prisma.personne.findUniqueOrThrow({ where: { id: cible.id } })).actif).toBe(
        false,
      );
      expect((await t.http().get("/patron/aujourdhui").set(auth(cible.jeton))).status).toBe(401);
      const encore = await t
        .http()
        .post(`/patron/reglages/personnes/${cible.id}/desactivation`)
        .set(auth(jeton))
        .send({ personneId: cible.id, signature: signature() });
      expect(encore.status).toBe(409);
      const soi = await t
        .http()
        .post(`/patron/reglages/personnes/${patronId}/desactivation`)
        .set(auth(jeton))
        .send({ personneId: patronId, signature: signature() });
      expect(soi.status).toBe(403);
    });

    it("un compte désactivé ne signe plus : son PIN est refusé", async () => {
      const ancien = await t.compte("patron", { compagnieId, nom: "Ancien patron" });
      await prisma.personne.update({ where: { id: ancien.id }, data: { actif: false } });
      const r = await t
        .http()
        .put("/patron/reglages/regles")
        .set(auth(ancien.jeton))
        .send({
          regles: {
            annulation: {
              gratuiteJusqua: "1h_avant",
              retenue: "selon_classe",
              retenueParClassePct: { classique: 25, vip: 50 },
            },
            caisse: { toleranceEcart: 1000, auDela: "pin_superviseur" },
            cadence: { numeroObligatoire: false },
            fraisService: { montant: 250, priseEnChargeParAgence: false },
          },
          signature: signature(),
        });
      expect([401, 403]).toContain(r.status);
      expect(
        (await prisma.reglesCompagnie.findUniqueOrThrow({ where: { compagnieId } }))
          .fraisServiceMontant,
      ).toBe(300);
    });

    it("la base refuse un opérateur inconnu, un jour de paie impossible et une personne supprimée emporte ses réglages", async () => {
      expect(
        await erreurSql(`UPDATE personne_reglage SET operateur = 'Moov' WHERE "personneId" = $1`, [
          aliceId,
        ]),
      ).toMatch(/personne_reglage_operateur_connu/);
      expect(
        await erreurSql(`UPDATE personne_reglage SET "jourDePaie" = 32 WHERE "personneId" = $1`, [
          aliceId,
        ]),
      ).toMatch(/personne_reglage_jour_de_paie/);
      expect(
        await erreurSql(
          `INSERT INTO personne_reglage ("personneId", operateur, droits, "modifieA") VALUES (gen_random_uuid(), 'MTN', '{}', now())`,
        ),
      ).toMatch(/personne_reglage_personne_fkey/);
    });
  });

  describe("comptes mobile money", () => {
    const numero = "+237677000111";
    const demande = (extra: Record<string, unknown> = {}) => ({
      operateur: "mtn" as const,
      nouveauNumero: "+237677998877",
      signature: signature(),
      ...extra,
    });

    it("deux temps : le code part sur l'ancien numéro ; le changement garde l'ancien jusqu'à minuit", async () => {
      await prisma.compteMomoAgence.create({
        data: {
          compagnieId,
          operateur: "mtn",
          telephoneChiffre: chiffrement.chiffrer(numero, CONTEXTE_MOMO_AGENCE),
          modifieA: new Date("2027-01-01T00:00:00.000Z"),
          modifiePar: patronId,
        },
      });
      const r1 = await t
        .http()
        .post("/patron/reglages/comptes-momo/confirmation")
        .set(auth(jeton))
        .send(demande());
      expect(r1.status, JSON.stringify(r1.body)).toBe(200);
      patron.ConfirmationCompteMomoEnvoyeeSchema.parse(r1.body);
      const message = sms.dernier();
      expect(message?.telephone).toBe(numero);
      const code = /code (\d{6})/.exec(message?.message ?? "")?.[1];
      expect(code).toBeDefined();
      expect(JSON.stringify(r1.body)).not.toContain(code!);
      const attente = await prisma.confirmationCompteMomo.findUniqueOrThrow({
        where: { compagnieId_operateur: { compagnieId, operateur: "mtn" } },
      });
      expect(attente.empreinte).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(attente)).not.toContain(code!);

      expect(
        (
          await t
            .http()
            .post("/patron/reglages/comptes-momo/confirmation")
            .set(auth(jeton))
            .send(demande({ signature: signature() }))
        ).status,
      ).toBe(429);

      const faux = await t
        .http()
        .put("/patron/reglages/comptes-momo")
        .set(auth(jeton))
        .send({
          ...demande({ signature: signature() }),
          codeSms: code === "000000" ? "111111" : "000000",
        });
      expect(faux.status).toBe(403);
      expect(
        (
          await prisma.confirmationCompteMomo.findUniqueOrThrow({
            where: { compagnieId_operateur: { compagnieId, operateur: "mtn" } },
          })
        ).essais,
      ).toBe(1);

      const bon = await t
        .http()
        .put("/patron/reglages/comptes-momo")
        .set(auth(jeton))
        .send({ ...demande({ signature: signature() }), codeSms: code });
      expect(bon.status, JSON.stringify(bon.body)).toBe(200);
      patron.CompteMomoChangeSchema.parse(bon.body);

      const compte = await prisma.compteMomoAgence.findUniqueOrThrow({
        where: { compagnieId_operateur: { compagnieId, operateur: "mtn" } },
      });
      expect(chiffrement.dechiffrer(compte.telephoneChiffre, CONTEXTE_MOMO_AGENCE)).toBe(
        "+237677998877",
      );
      expect(chiffrement.dechiffrer(compte.ancienChiffre!, CONTEXTE_MOMO_AGENCE)).toBe(numero);
      expect(compte.ancienJusqua!.getTime()).toBeGreaterThan(t.horloge.maintenant().getTime());
      expect(
        await prisma.confirmationCompteMomo.count({ where: { compagnieId, operateur: "mtn" } }),
      ).toBe(0);
      // Le code ne sert qu'une fois.
      const rejeu = await t
        .http()
        .put("/patron/reglages/comptes-momo")
        .set(auth(jeton))
        .send({ ...demande({ signature: signature() }), codeSms: code });
      expect([403, 404, 409, 410, 423]).toContain(rejeu.status);

      const accueil = patron.ReglagesSchema.parse(
        (await t.http().get("/patron/reglages").set(auth(jeton))).body,
      );
      expect(JSON.stringify(accueil)).not.toContain("998877");
    });

    it("trois codes faux bloquent la demande, même suivis du bon ; les compteurs tiennent en base", async () => {
      t.horloge.avancer(120_000);
      const nouveau = "+237677333222";
      await t
        .http()
        .post("/patron/reglages/comptes-momo/confirmation")
        .set(auth(jeton))
        .send(demande({ nouveauNumero: nouveau, signature: signature() }));
      const code = /code (\d{6})/.exec(sms.dernier()?.message ?? "")?.[1];
      for (let i = 0; i < 3; i++) {
        const rate = await t
          .http()
          .put("/patron/reglages/comptes-momo")
          .set(auth(jeton))
          .send({
            ...demande({ nouveauNumero: nouveau, signature: signature() }),
            codeSms: code === "123456" ? "654321" : "123456",
          });
        expect(rate.status).toBe(403);
      }
      const bloque = await t
        .http()
        .put("/patron/reglages/comptes-momo")
        .set(auth(jeton))
        .send({ ...demande({ nouveauNumero: nouveau, signature: signature() }), codeSms: code });
      expect(bloque.status).toBe(423);
      expect(
        (
          await prisma.confirmationCompteMomo.findUniqueOrThrow({
            where: { compagnieId_operateur: { compagnieId, operateur: "mtn" } },
          })
        ).essais,
      ).toBe(3);
    });

    it("la base refuse un essai de trop, un opérateur inconnu et une empreinte mal formée", async () => {
      expect(
        await erreurSql(`UPDATE confirmation_compte_momo SET essais = 4 WHERE "compagnieId" = $1`, [
          compagnieId,
        ]),
      ).toMatch(/confirmation_compte_momo_essais/);
      expect(
        await erreurSql(
          `UPDATE confirmation_compte_momo SET empreinte = 'abc' WHERE "compagnieId" = $1`,
          [compagnieId],
        ),
      ).toMatch(/confirmation_compte_momo_empreinte/);
      expect(
        await erreurSql(
          `UPDATE compte_momo_agence SET operateur = 'moov' WHERE "compagnieId" = $1`,
          [compagnieId],
        ),
      ).toMatch(/compte_momo_agence_operateur_connu/);
      expect(
        await erreurSql(
          `UPDATE compte_momo_agence SET "ancienJusqua" = NULL WHERE "compagnieId" = $1`,
          [compagnieId],
        ),
      ).toMatch(/compte_momo_agence_ancien_et_echeance/);
    });
  });
});
