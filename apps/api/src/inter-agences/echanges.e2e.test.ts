import { colis as contrats } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALPHA,
  D_ALPHA_COLIS,
  D_BETA,
  D_OMEGA,
  OMEGA,
  creerAppInterAgencesTest,
  dernierSmsA,
  entete,
  type AppInterAgencesTest,
} from "./testing/app-inter-agences-test";

describe("colis en correspondance : un numéro, deux tronçons, la responsabilité passe au scan", () => {
  let t: AppInterAgencesTest;

  beforeEach(async () => {
    t = await creerAppInterAgencesTest();
  });
  afterEach(async () => {
    await t.fermer();
  });

  const plan = (jeton: string, colisId: string) =>
    t.http().get(`/inter-agences/colis/${colisId}`).set(entete(jeton));

  describe("enregistrement du plan", () => {
    it("sans convention en vigueur : 422, rien n'est enregistré", async () => {
      const colis = await t.creerColis();
      const rep = await t
        .http()
        .post("/inter-agences/colis")
        .set(entete(t.equipe.guichetierAlpha.jeton))
        .send({ colisId: colis.colisId, departIds: [D_ALPHA_COLIS.id, D_OMEGA.id] });
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("pas_de_convention");
      expect(await t.plansRepo.trouver(colis.colisId)).toBeNull();
    });

    it("avec la convention : le port de 3 000 F se partage 1 600 / 1 400 entre les deux tronçons", async () => {
      await t.conventionEnVigueur();
      const colis = await t.colisEnCorrespondance();
      const rep = await plan(t.equipe.guichetierAlpha.jeton, colis.colisId);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(rep.body.numero).toBe(colis.numero);
      expect(rep.body.troncons).toEqual([
        {
          rang: 1,
          compagnie: "Alpha",
          trajet: "Douala → Bafoussam",
          depart: D_ALPHA_COLIS.heureDepart,
          bus: D_ALPHA_COLIS.bus,
          arrivee: D_ALPHA_COLIS.arriveePrevue,
          part: 1600,
        },
        {
          rang: 2,
          compagnie: "Oméga",
          trajet: "Bafoussam → Bamenda",
          depart: D_OMEGA.heureDepart,
          bus: D_OMEGA.bus,
          arrivee: D_OMEGA.arriveePrevue,
          part: 1400,
        },
      ]);
      // Le colis est à Alpha tant qu'aucun scan n'a eu lieu.
      expect(rep.body.responsable).toEqual({
        compagnieId: ALPHA,
        compagnie: "Alpha",
        enTransfert: false,
      });
      expect(rep.body.remboursementMax).toBe(50_000);
    });

    it("le premier tronçon doit être celui de la compagnie ; le second, une autre compagnie liée", async () => {
      await t.conventionEnVigueur();
      const colis = await t.creerColis();
      const enregistrer = (departIds: string[]) =>
        t
          .http()
          .post("/inter-agences/colis")
          .set(entete(t.equipe.guichetierAlpha.jeton))
          .send({ colisId: colis.colisId, departIds });

      const inverse = await enregistrer([D_OMEGA.id, D_ALPHA_COLIS.id]);
      expect(inverse.status).toBe(422);
      expect(inverse.body.code).toBe("premier_troncon_autre_compagnie");

      // Bêta a un départ qui convient, mais aucune convention avec Alpha.
      const sansConvention = await enregistrer([D_ALPHA_COLIS.id, D_BETA.id]);
      expect(sansConvention.status).toBe(422);
      expect(sansConvention.body.code).toBe("pas_de_convention");

      const inconnu = await enregistrer([D_ALPHA_COLIS.id, "dep-inexistant"]);
      expect(inconnu.status).toBe(404);
      expect(await t.plansRepo.trouver(colis.colisId)).toBeNull();
    });

    it("le second bus doit partir après l'arrivée du premier", async () => {
      await t.conventionEnVigueur();
      const colis = await t.creerColis();
      t.departs.departs.set("dep-ome-avant", {
        ...D_OMEGA,
        id: "dep-ome-avant",
        heureDepart: "2026-11-02T14:00:00.000+01:00",
        arriveePrevue: "2026-11-02T16:30:00.000+01:00",
      });
      const rep = await t
        .http()
        .post("/inter-agences/colis")
        .set(entete(t.equipe.guichetierAlpha.jeton))
        .send({ colisId: colis.colisId, departIds: [D_ALPHA_COLIS.id, "dep-ome-avant"] });
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("correspondance_impossible");
    });

    it("un colis déjà en correspondance ne s'enregistre pas deux fois : 409", async () => {
      await t.conventionEnVigueur();
      const colis = await t.colisEnCorrespondance();
      const rep = await t
        .http()
        .post("/inter-agences/colis")
        .set(entete(t.equipe.guichetierAlpha.jeton))
        .send({ colisId: colis.colisId, departIds: [D_ALPHA_COLIS.id, D_OMEGA.id] });
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("deja_enregistre");
    });

    it("un colis d'une autre compagnie : 404 ; un convoyeur n'enregistre pas : 403", async () => {
      await t.conventionEnVigueur();
      const colis = await t.creerColis();
      const autre = await t
        .http()
        .post("/inter-agences/colis")
        .set(entete(t.equipe.guichetierOmega.jeton))
        .send({ colisId: colis.colisId, departIds: [D_OMEGA.id, D_ALPHA_COLIS.id] });
      expect(autre.status).toBe(404);
      const convoyeur = await t
        .http()
        .post("/inter-agences/colis")
        .set(entete(t.equipe.convoyeurAlpha.jeton))
        .send({ colisId: colis.colisId, departIds: [D_ALPHA_COLIS.id, D_OMEGA.id] });
      expect(convoyeur.status).toBe(403);
    });

    it("trois tronçons ou plus : refusés, la convention n'en couvre que deux", async () => {
      await t.conventionEnVigueur();
      const colis = await t.creerColis();
      const rep = await t
        .http()
        .post("/inter-agences/colis")
        .set(entete(t.equipe.guichetierAlpha.jeton))
        .send({ colisId: colis.colisId, departIds: [D_ALPHA_COLIS.id, D_OMEGA.id, D_BETA.id] });
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("troncons_non_pris_en_charge");
    });
  });

  describe("scans de transfert", () => {
    it("remis à : la responsabilité reste à Alpha ; reçu : elle passe à Oméga", async () => {
      await t.conventionEnVigueur();
      const { colisId, numero } = await t.colisEnCorrespondance();

      const remis = await t.scanner(
        t.equipe.convoyeurAlpha.jeton,
        colisId,
        "remis_a",
        "Oméga",
        "Bafoussam",
      );
      expect(remis.status, JSON.stringify(remis.body)).toBe(200);
      const r = contrats.SchemaTransfertEnregistre.parse(remis.body);
      expect(r).toMatchObject({ sens: "remis_a", compagnie: "Oméga", responsable: "cedant" });
      expect(r.colis.numero).toBe(numero);
      expect((await plan(t.equipe.patronAlpha.jeton, colisId)).body.responsable).toEqual({
        compagnieId: ALPHA,
        compagnie: "Alpha",
        enTransfert: true,
      });

      t.horloge.avancer(20 * 60_000);
      const recu = await t.scanner(
        t.equipe.convoyeurOmega.jeton,
        colisId,
        "recu",
        "Oméga",
        "Bafoussam",
      );
      expect(recu.status, JSON.stringify(recu.body)).toBe(200);
      const b = contrats.SchemaTransfertEnregistre.parse(recu.body);
      expect(b).toMatchObject({ sens: "recu", compagnie: "Oméga", responsable: "preneur" });
      expect(Date.parse(b.scanneLe)).toBeGreaterThan(Date.parse(r.scanneLe));
      // Le colis est à Oméga : les deux compagnies le voient ainsi.
      for (const jeton of [t.equipe.patronAlpha.jeton, t.equipe.patronOmega.jeton]) {
        expect((await plan(jeton, colisId)).body.responsable).toEqual({
          compagnieId: OMEGA,
          compagnie: "Oméga",
          enTransfert: false,
        });
      }
    });

    it("« reçu » avant « remis à » : 409, le colis reste à Alpha", async () => {
      await t.conventionEnVigueur();
      const { colisId } = await t.colisEnCorrespondance();
      const rep = await t.scanner(t.equipe.convoyeurOmega.jeton, colisId, "recu", "Oméga");
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("remise_non_scannee");
      expect((await plan(t.equipe.patronAlpha.jeton, colisId)).body.responsable.compagnie).toBe(
        "Alpha",
      );
    });

    it("seul le porteur cède et seul le preneur reçoit : 403 sinon", async () => {
      await t.conventionEnVigueur();
      const { colisId } = await t.colisEnCorrespondance();
      // Oméga ne peut pas céder un colis qu'elle n'a pas.
      const cession = await t.scanner(t.equipe.convoyeurOmega.jeton, colisId, "remis_a", "Alpha");
      expect(cession.status).toBe(403);
      expect(cession.body.code).toBe("pas_le_porteur");
      // Alpha ne peut pas se déclarer preneur de son propre colis.
      await t.scanner(t.equipe.convoyeurAlpha.jeton, colisId, "remis_a", "Oméga");
      const reception = await t.scanner(t.equipe.convoyeurAlpha.jeton, colisId, "recu", "Alpha");
      expect(reception.status).toBe(403);
      expect(reception.body.code).toBe("pas_le_preneur");
    });

    it("la compagnie annoncée doit être celle qui prend le colis : 422 mauvais_preneur", async () => {
      await t.conventionEnVigueur();
      const { colisId } = await t.colisEnCorrespondance();
      const rep = await t.scanner(t.equipe.convoyeurAlpha.jeton, colisId, "remis_a", "Bêta");
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("mauvais_preneur");
      expect(rep.body.message).toBeTypeOf("string");
      // Rien n'a été écrit : le scan correct passe ensuite.
      const plans = await t.plansRepo.trouver(colisId);
      expect(plans?.transferts[0]?.remis).toBeNull();
    });

    it("la compagnie du scan se lit par nom (sans accent ni casse) ou par identifiant", async () => {
      await t.conventionEnVigueur();
      const { colisId } = await t.colisEnCorrespondance();
      const parNom = await t.scanner(t.equipe.convoyeurAlpha.jeton, colisId, "remis_a", "OMEGA");
      expect(parNom.status, JSON.stringify(parNom.body)).toBe(200);
      const parId = await t.scanner(t.equipe.convoyeurOmega.jeton, colisId, "recu", OMEGA);
      expect(parId.status, JSON.stringify(parId.body)).toBe(200);
    });

    it("rejouer un scan ne change rien : même horodatage, un seul SMS, une seule trace", async () => {
      await t.conventionEnVigueur();
      const { colisId } = await t.colisEnCorrespondance();
      await t.scanner(t.equipe.convoyeurAlpha.jeton, colisId, "remis_a", "Oméga");
      const premier = await t.scanner(t.equipe.convoyeurOmega.jeton, colisId, "recu", "Oméga");
      const smsAvant = t.sms.messages().length;
      t.horloge.avancer(5 * 60_000);
      const rejoue = await t.scanner(t.equipe.convoyeurOmega.jeton, colisId, "recu", "Oméga");
      expect(rejoue.status).toBe(200);
      expect(rejoue.body.scanneLe).toBe(premier.body.scanneLe);
      expect(rejoue.body.responsable).toBe("preneur");
      expect(t.sms.messages().length).toBe(smsAvant);
      // La cession rejouée après la réception n'efface pas non plus la réception.
      const cessionRejouee = await t.scanner(
        t.equipe.convoyeurAlpha.jeton,
        colisId,
        "remis_a",
        "Oméga",
      );
      expect(cessionRejouee.status).toBe(409);
      const stocke = await t.plansRepo.trouver(colisId);
      expect(stocke?.transferts[0]?.recu?.a).toBe(premier.body.scanneLe);
      const traces = t.auditRepo.lignes.filter((l) => l.action === "inter_agences.colis_recu");
      expect(traces).toHaveLength(1);
    });

    it("le client reçoit un SMS au « reçu », avec le même numéro et la compagnie qui prend le relais", async () => {
      await t.conventionEnVigueur();
      const { colisId, numero } = await t.colisEnCorrespondance();
      await t.scanner(t.equipe.convoyeurAlpha.jeton, colisId, "remis_a", "Oméga", "Bafoussam");
      // La remise seule ne prévient pas encore : la responsabilité n'a pas changé.
      const avant = dernierSmsA(t, t.equipe.expediteur.telephone);
      expect(avant ?? "").not.toMatch(/a changé de bus/);
      await t.scanner(t.equipe.convoyeurOmega.jeton, colisId, "recu", "Oméga", "Bafoussam");
      const sms = dernierSmsA(t, t.equipe.expediteur.telephone);
      expect(sms).toContain(numero);
      expect(sms).toContain("Oméga");
      expect(sms).toContain("Bafoussam");
    });

    it("le scan d'un colis qui n'est pas en correspondance : 404", async () => {
      await t.conventionEnVigueur();
      const colis = await t.creerColis();
      const rep = await t.scanner(t.equipe.convoyeurAlpha.jeton, colis.colisId, "remis_a", "Oméga");
      expect(rep.status).toBe(404);
      expect(rep.body.code).toBe("colis_hors_inter_agences");
    });

    it("une troisième compagnie ne voit ni le plan, ni ne scanne : 404 partout", async () => {
      await t.conventionEnVigueur();
      const { colisId } = await t.colisEnCorrespondance();
      expect((await plan(t.equipe.patronBeta.jeton, colisId)).status).toBe(404);
      const remis = await t.scanner(t.equipe.convoyeurBeta.jeton, colisId, "remis_a", "Oméga");
      expect(remis.status).toBe(404);
      const recu = await t.scanner(t.equipe.convoyeurBeta.jeton, colisId, "recu", "Oméga");
      expect(recu.status).toBe(404);
      const vue = await t.http().get("/inter-agences").set(entete(t.equipe.patronBeta.jeton));
      expect(vue.body.colis).toEqual([]);
    });

    it("un voyageur ou un patron ne scannent pas : 403", async () => {
      await t.conventionEnVigueur();
      const { colisId } = await t.colisEnCorrespondance();
      for (const jeton of [t.equipe.expediteur.jeton, t.equipe.patronAlpha.jeton]) {
        const rep = await t.scanner(jeton, colisId, "remis_a", "Oméga");
        expect(rep.status).toBe(403);
      }
    });

    it("un corps de scan illisible : 400", async () => {
      const rep = await t
        .http()
        .post("/inter-agences/transferts")
        .set(entete(t.equipe.convoyeurAlpha.jeton))
        .send({ colisId: "x", sens: "donne" });
      expect(rep.status).toBe(400);
    });
  });

  describe("la planche « Entre compagnies » (colis)", () => {
    it("liste le colis en correspondance avec son règle de transfert, validée par le contrat", async () => {
      const id = await t.conventionEnVigueur();
      const { colisId, numero } = await t.colisEnCorrespondance();
      const rep = await t.http().get("/inter-agences").set(entete(t.equipe.patronOmega.jeton));
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaInterAgences.parse(rep.body);
      expect(vue.titre).toBe("Entre compagnies");
      expect(vue.colis).toHaveLength(1);
      expect(vue.colis[0]?.colis.numero).toBe(numero);
      expect(vue.colis[0]?.trajet).toBe("Douala → Bamenda");
      expect(vue.colis[0]?.troncons.map((x) => [x.compagnie, x.part])).toEqual([
        ["Alpha", 1600],
        ["Oméga", 1400],
      ]);
      expect(vue.colis[0]?.regle).toBe(
        "À Bafoussam, le convoyeur Alpha scanne « remis à Oméga », le convoyeur Oméga scanne « reçu ». " +
          "Le client suit un seul numéro. La responsabilité passe au scan.",
      );
      expect(vue.conventions).toEqual([{ id, partenaire: "Alpha", libelle: "Convention Alpha" }]);
      expect(vue.colis[0]?.colis.id).toBe(colisId);
    });

    it("la correspondance voyageurs porte les 25 et 15 minutes de la convention", async () => {
      await t.conventionEnVigueur();
      const rep = await t.http().get("/inter-agences").set(entete(t.equipe.patronAlpha.jeton));
      const vue = contrats.SchemaInterAgences.parse(rep.body);
      expect(vue.voyageurs.correspondanceMinutes).toBe(25);
      expect(vue.voyageurs.attenteSecondBusMinutes).toBe(15);
      expect(vue.voyageurs.texte).toContain("Yaoundé");
      expect(vue.voyageurs.texte).toContain("Bamenda");
    });

    it("sans convention : planche vide, avec le texte « aucune correspondance » du module", async () => {
      const rep = await t.http().get("/inter-agences").set(entete(t.equipe.patronBeta.jeton));
      const vue = contrats.SchemaInterAgences.parse(rep.body);
      expect(vue.colis).toEqual([]);
      expect(vue.conventions).toEqual([]);
      expect(vue.voyageurs.texte.length).toBeGreaterThan(0);
    });
  });
});
