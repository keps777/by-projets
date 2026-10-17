import { colis as contrats } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEPART_BAF,
  POINT_RELAIS,
  codeDuSms,
  creerAppColisTest,
  dernierSmsA,
  demandeCreation,
  entete,
  type AppColisTest,
} from "./testing/app-colis-test";
import {
  amenerJusquaDisponible,
  creerColisApp,
  creerEquipe,
  scanner,
  type Equipe,
} from "./testing/scenarios";

/**
 * Colis du voyageur de bout en bout : HTTP, gardes et rôles, adaptateurs en mémoire. Chaque réponse
 * est validée avec le schéma zod du contrat (`@afrimove/contrats`, `colis`).
 */
describe("colis du voyageur", () => {
  let t: AppColisTest;
  let e: Equipe;

  beforeAll(async () => {
    t = await creerAppColisTest();
    e = await creerEquipe(t);
  });
  afterAll(async () => {
    await t.fermer();
  });
  beforeEach(() => {
    t.horloge.regler();
    t.paiements.refuser = false;
    t.paiements.enAttente = false;
    t.assureur.indisponible = false;
  });

  describe("accès", () => {
    it("exige un jeton, et le rôle voyageur", async () => {
      expect((await t.http().get("/colis/options-envoi")).status).toBe(401);
      const guichet = await t.http().get("/colis/options-envoi").set(entete(e.guichetier.jeton));
      expect(guichet.status).toBe(403);
      const rep = await t.http().post("/colis").set(entete(e.guichetier.jeton)).send({});
      expect(rep.status).toBe(403);
    });
  });

  describe("options, photo et devis", () => {
    it("propose les départs, les modes et l'assurance (SchemaOptionsEnvoiColis)", async () => {
      const rep = await t
        .http()
        .get("/colis/options-envoi?ville=Bafoussam")
        .set(entete(e.expediteur.jeton));
      expect(rep.status).toBe(200);
      const options = contrats.SchemaOptionsEnvoiColis.parse(rep.body);
      expect(options.departs).toHaveLength(1);
      expect(options.departs[0]).toMatchObject({
        departId: DEPART_BAF.id,
        compagnie: "Alpha Voyages",
        retrait: "gare de Bafoussam",
        port: 1500,
        recommande: true,
      });
      expect(options.modes.map((m) => [m.mode, m.supplement])).toEqual([
        ["gare", 0],
        ["relais", 300],
        ["moto", 1000],
      ]);
      expect(options.assurance).toMatchObject({
        tauxPct: 2,
        minimum: 500,
        plafondValeur: 500_000,
      });
      expect(options.suggestion).toBeNull();
    });

    it("ne propose pas un départ d'une autre ville", async () => {
      const rep = await t
        .http()
        .get("/colis/options-envoi?ville=Yaound%C3%A9")
        .set(entete(e.expediteur.jeton));
      expect(contrats.SchemaOptionsEnvoiColis.parse(rep.body).departs).toEqual([]);
    });

    it("ne propose pas un départ fermé aux colis ou déjà parti", async () => {
      t.referentiel.departs.set("ferme", { ...DEPART_BAF, id: "ferme", ouvertAuColis: false });
      t.referentiel.departs.set("parti", {
        ...DEPART_BAF,
        id: "parti",
        heureDepart: "2026-11-02T08:00:00.000+01:00",
      });
      const rep = await t.http().get("/colis/options-envoi").set(entete(e.expediteur.jeton));
      expect(
        contrats.SchemaOptionsEnvoiColis.parse(rep.body).departs.map((d) => d.departId),
      ).toEqual([DEPART_BAF.id]);
      t.referentiel.departs.delete("ferme");
      t.referentiel.departs.delete("parti");
    });

    it("estime la taille et le poids sur la photo, et garde la photo 90 jours", async () => {
      const rep = await t
        .http()
        .post("/colis/photo")
        .set(entete(e.expediteur.jeton))
        .send({ photoRef: "photos/estimation-1.jpg" });
      expect(rep.status).toBe(200);
      expect(contrats.SchemaEstimationPhoto.parse(rep.body)).toEqual({
        photoRef: "photos/estimation-1.jpg",
        taille: "petit carton",
        poidsKg: 2,
      });
      const photo = await t.photos.trouver("photos/estimation-1.jpg");
      expect(photo).toMatchObject({
        genre: "envoi",
        priseA: "2026-11-02T09:00:00.000+01:00",
        expireA: "2027-01-31T09:00:00.000+01:00",
        supprimeeA: null,
      });
    });

    it("calcule le devis du domaine : port 1 500 + frais 200 + assurance 500 = 2 200 F", async () => {
      const rep = await t
        .http()
        .get(`/colis/devis?departId=${DEPART_BAF.id}&mode=gare&valeurAssuree=25000`)
        .set(entete(e.expediteur.jeton));
      expect(rep.status).toBe(200);
      const devis = contrats.SchemaDevisColis.parse(rep.body);
      expect(devis.lignes.map((l) => [l.code, l.montant])).toEqual([
        ["port", 1500],
        ["frais_app", 200],
        ["assurance", 500],
      ]);
      expect(devis.total).toBe(2200);
    });

    it("ajoute 300 F pour un relais et au moins 1 000 F pour une livraison moto", async () => {
      const total = async (suite: string): Promise<number> => {
        const rep = await t
          .http()
          .get(`/colis/devis?departId=${DEPART_BAF.id}&valeurAssuree=25000&${suite}`)
          .set(entete(e.expediteur.jeton));
        expect(rep.status, JSON.stringify(rep.body)).toBe(200);
        return rep.body.total as number;
      };
      expect(await total("mode=relais")).toBe(2500);
      expect(await total("mode=moto")).toBe(3200);
      expect(await total("mode=moto&prixLivraison=1500")).toBe(3700);
    });

    it("refuse une livraison sous 1 000 F, un départ inconnu et un mode inconnu", async () => {
      const get = (q: string) => t.http().get(`/colis/devis?${q}`).set(entete(e.expediteur.jeton));
      const bas = await get(
        `departId=${DEPART_BAF.id}&mode=moto&valeurAssuree=0&prixLivraison=500`,
      );
      expect(bas.status).toBe(422);
      expect(bas.body.code).toBe("devis_invalide");
      const inconnu = await get("departId=nulle-part&mode=gare&valeurAssuree=0");
      expect(inconnu.status).toBe(404);
      expect(inconnu.body.code).toBe("depart_introuvable");
      const mode = await get(`departId=${DEPART_BAF.id}&mode=drone&valeurAssuree=0`);
      expect(mode.status).toBe(400);
      expect(mode.body.details[0].chemin).toBe("mode");
    });

    it("plafonne la valeur assurée à 500 000 F", async () => {
      const rep = await t
        .http()
        .get(`/colis/devis?departId=${DEPART_BAF.id}&mode=gare&valeurAssuree=900000`)
        .set(entete(e.expediteur.jeton));
      // 2 % de 500 000 F = 10 000 F, pas 18 000 F.
      expect(rep.body.lignes.find((l: { code: string }) => l.code === "assurance").montant).toBe(
        10000,
      );
    });
  });

  describe("créer et payer", () => {
    it("crée le colis, le paie et renvoie le code à l'expéditeur seul (SchemaColisCree)", async () => {
      const rep = await t
        .http()
        .post("/colis")
        .set(entete(e.expediteur.jeton))
        .send(demandeCreation());
      expect(rep.status).toBe(201);
      const cree = contrats.SchemaColisCree.parse(rep.body);
      expect(cree.colis).toMatchObject({
        role: "expediteur",
        etat: "enregistre",
        mode: "gare",
        assure: true,
        valeurAssuree: 25000,
        prixTotal: 2200,
        contenu: "Médicaments et vêtements",
        expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
        destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
      });
      expect(cree.colis.numero).toMatch(/^C-DLA-261102-4001$/);
      expect(cree.colis.retrait.code).toMatch(/^\d{6}$/);
      expect(cree.devis.total).toBe(2200);
      expect(cree.paiement).toMatchObject({ moyen: "mtn_momo", etat: "paye", montant: 2200 });
      expect(cree.etiquettePrete).toBe(true);
      expect(t.paiements.demandes.at(-1)).toMatchObject({
        moyen: "mtn_momo",
        numero: "+237691221008",
        montant: 2200,
        payeurId: e.expediteur.id,
      });
    });

    it("numérote sans trou dans la plage 4001–9999 de la gare et du jour", async () => {
      const a = await creerColisApp(t, e);
      const b = await creerColisApp(t, e);
      const sequence = (numero: string): number => Number(numero.slice(-4));
      expect(sequence(b.numero)).toBe(sequence(a.numero) + 1);
      expect(sequence(a.numero)).toBeGreaterThanOrEqual(4001);
    });

    it("envoie le code au destinataire seul, par SMS", async () => {
      const { code, numero } = await creerColisApp(t, e);
      const sms = dernierSmsA(t, "+237699401822");
      expect(sms).toBeDefined();
      expect(sms).toContain(numero);
      expect(codeDuSms(sms!)).toBe(code);
      // Ni l'expéditeur ni personne d'autre ne reçoit le code par SMS.
      const ailleurs = t.sms.messages().filter((m) => m.telephone !== "+237699401822");
      expect(ailleurs.some((m) => m.message.includes(code))).toBe(false);
    });

    it("souscrit l'assurance chez l'assureur partenaire", async () => {
      const avant = t.assureur.polices.length;
      const { colisId } = await creerColisApp(t, e);
      expect(t.assureur.polices).toHaveLength(avant + 1);
      expect(t.assureur.polices.at(-1)).toMatchObject({ valeurAssuree: 25000, prime: 500 });
      const stocke = await t.repo.trouver(colisId);
      expect(stocke?.assurance).toEqual({
        police: t.assureur.polices.at(-1)!.police,
        enAttente: false,
      });
    });

    it("ne souscrit rien pour un colis non assuré, et n'ajoute pas de ligne d'assurance", async () => {
      const avant = t.assureur.polices.length;
      const { reponse } = await creerColisApp(t, e, { assurer: false });
      expect(t.assureur.polices).toHaveLength(avant);
      expect(reponse.devis.total).toBe(1700);
    });

    it("garde la photo, avec sa date d'expiration à 90 jours", async () => {
      const { colisId } = await creerColisApp(t, e, { photoRef: "photos/envoi-42.jpg" });
      const photos = await t.photos.parColis(colisId);
      expect(photos).toHaveLength(1);
      expect(photos[0]).toMatchObject({
        ref: "photos/envoi-42.jpg",
        priseA: "2026-11-02T09:00:00.000+01:00",
        expireA: "2027-01-31T09:00:00.000+01:00",
      });
    });

    it("refuse le colis si l'opérateur refuse le paiement : rien n'est créé ni envoyé", async () => {
      const colisAvant = t.repo.lignes.size;
      const smsAvant = t.sms.messages().length;
      t.paiements.refuser = true;
      const rep = await t
        .http()
        .post("/colis")
        .set(entete(e.expediteur.jeton))
        .send(demandeCreation());
      expect(rep.status).toBe(402);
      expect(rep.body.code).toBe("paiement_refuse");
      expect(t.repo.lignes.size).toBe(colisAvant);
      expect(t.sms.messages()).toHaveLength(smsAvant);
    });

    it("garde le colis non payé en attente : pas de code envoyé, pas d'assurance, puis confirmation", async () => {
      t.paiements.enAttente = true;
      const smsAvant = t.sms.messages().length;
      const polices = t.assureur.polices.length;
      const { colisId, reponse } = await creerColisApp(t, e);
      expect(reponse.paiement.etat).toBe("en_attente");
      expect(t.sms.messages()).toHaveLength(smsAvant);
      expect(t.assureur.polices).toHaveLength(polices);

      await t.colis.confirmerPaiement(colisId);
      expect(t.sms.messages()).toHaveLength(smsAvant + 1);
      expect(t.assureur.polices).toHaveLength(polices + 1);
      expect((await t.repo.trouver(colisId))?.paiement?.etat).toBe("paye");
    });

    it("exige un point relais pour le mode relais, une adresse pour la moto", async () => {
      const post = (over: Record<string, unknown>) =>
        t.http().post("/colis").set(entete(e.expediteur.jeton)).send(demandeCreation(over));
      const sansRelais = await post({ mode: "relais" });
      expect(sansRelais.status).toBe(422);
      expect(sansRelais.body.code).toBe("relais_requis");
      const relaisInconnu = await post({ mode: "relais", relaisId: "inconnu" });
      expect(relaisInconnu.status).toBe(404);
      const sansAdresse = await post({ mode: "moto" });
      expect(sansAdresse.status).toBe(422);
      expect(sansAdresse.body.code).toBe("adresse_requise");

      const relais = await post({ mode: "relais", relaisId: POINT_RELAIS.id });
      expect(relais.status).toBe(201);
      expect(relais.body.devis.total).toBe(2500);
      const moto = await post({ mode: "moto", adresseLivraison: "Quartier Tamdja, Bafoussam" });
      expect(moto.status).toBe(201);
      expect(moto.body.devis.total).toBe(3200);
    });

    it("refuse un numéro de paiement absent, une assurance sans valeur et un corps invalide", async () => {
      const post = (corps: unknown) =>
        t
          .http()
          .post("/colis")
          .set(entete(e.expediteur.jeton))
          .send(corps as object);
      const sansNumero = await post(demandeCreation({ paiement: { moyen: "orange_money" } }));
      expect(sansNumero.status).toBe(422);
      const sansValeur = await post(demandeCreation({ assurer: true, valeurDeclaree: 0 }));
      expect(sansValeur.status).toBe(422);
      expect(sansValeur.body.code).toBe("valeur_requise");
      const invalide = await post(
        demandeCreation({ poidsKg: -1, destinataire: { nom: "", telephone: "699" } }),
      );
      expect(invalide.status).toBe(400);
      expect(invalide.body.code).toBe("REQUETE_INVALIDE");
      const chemins = invalide.body.details.map((d: { chemin: string }) => d.chemin);
      expect(chemins).toEqual(
        expect.arrayContaining(["poidsKg", "destinataire.nom", "destinataire.telephone"]),
      );
    });

    it("accepte une carte sans numéro", async () => {
      const rep = await t
        .http()
        .post("/colis")
        .set(entete(e.expediteur.jeton))
        .send(demandeCreation({ paiement: { moyen: "carte" } }));
      expect(rep.status).toBe(201);
    });
  });

  describe("lire le colis", () => {
    it("montre à l'expéditeur le code et le suivi (SchemaColisProprietaire)", async () => {
      const { colisId, code, numero } = await creerColisApp(t, e);
      const rep = await t.http().get(`/colis/${colisId}`).set(entete(e.expediteur.jeton));
      expect(rep.status).toBe(200);
      const vue = contrats.SchemaColisProprietaire.parse(rep.body);
      expect(vue).toMatchObject({ id: colisId, numero, role: "expediteur", etat: "enregistre" });
      expect(vue.retrait.code).toBe(code);
      expect(vue.retrait.libelle).toBe("Code de retrait · à donner à Ngo Thérèse seulement");
      expect(vue.suivi.map((s) => [s.jalon, s.fait])).toEqual([
        ["depose", false],
        ["charge", false],
        ["en_route", false],
        ["disponible", false],
        ["remis", false],
      ]);
      expect(vue.options.map((o) => [o.mode, o.prix])).toEqual([
        ["moto", 1000],
        ["relais", 300],
      ]);
      expect(vue.reclamation).toMatchObject({
        delaiReponseJoursOuvres: 2,
        multiplePortSiPerte: 10,
      });
    });

    it("montre aussi le colis au destinataire, qui y reconnaît son numéro de téléphone", async () => {
      const { colisId, code } = await creerColisApp(t, e);
      const rep = await t.http().get(`/colis/${colisId}`).set(entete(e.destinataire.jeton));
      expect(rep.status).toBe(200);
      const vue = contrats.SchemaColisProprietaire.parse(rep.body);
      expect(vue.role).toBe("destinataire");
      expect(vue.retrait.code).toBe(code);
      expect(vue.options).toEqual([]);
    });

    it("répond 404 à une personne qui n'est ni l'expéditeur ni le destinataire", async () => {
      const { colisId } = await creerColisApp(t, e);
      const rep = await t.http().get(`/colis/${colisId}`).set(entete(e.inconnu.jeton));
      expect(rep.status).toBe(404);
      expect(rep.body.code).toBe("colis_introuvable");
      expect(JSON.stringify(rep.body)).not.toMatch(/\d{6}/);
    });

    it("répond 404 à un identifiant inconnu", async () => {
      const rep = await t.http().get("/colis/inconnu").set(entete(e.expediteur.jeton));
      expect(rep.status).toBe(404);
    });

    it("suit les étapes : chargé, en route, disponible, remis", async () => {
      const { colisId, code } = await creerColisApp(t, e);
      await amenerJusquaDisponible(t, e, colisId);
      const vue = contrats.SchemaColisProprietaire.parse(
        (await t.http().get(`/colis/${colisId}`).set(entete(e.expediteur.jeton))).body,
      );
      expect(vue.etat).toBe("disponible");
      expect(vue.suivi.map((s) => [s.jalon, s.fait])).toEqual([
        ["depose", true],
        ["charge", true],
        ["en_route", true],
        ["disponible", true],
        ["remis", false],
      ]);
      expect(vue.arriveePrevue).toBeNull();

      const remise = await scanner(t, e.guichetierBaf.jeton, {
        colisId,
        action: "remettre",
        code,
        pieceVerifiee: true,
        photoRef: "photos/remise-1.jpg",
      });
      expect(remise.status).toBe(200);
      const apres = contrats.SchemaColisProprietaire.parse(
        (await t.http().get(`/colis/${colisId}`).set(entete(e.expediteur.jeton))).body,
      );
      expect(apres.etat).toBe("remis");
      expect(apres.suivi.at(-1)).toMatchObject({ jalon: "remis", fait: true });
      expect(apres.options).toEqual([]);
    });

    it("annonce l'arrivée prévue tant que le colis roule", async () => {
      const { colisId } = await creerColisApp(t, e);
      for (const [jeton, action] of [
        [e.guichetier.jeton, "charger"],
        [e.convoyeur.jeton, "expedier"],
      ] as const) {
        await scanner(t, jeton, { colisId, action });
      }
      const vue = contrats.SchemaColisProprietaire.parse(
        (await t.http().get(`/colis/${colisId}`).set(entete(e.expediteur.jeton))).body,
      );
      expect(vue.arriveePrevue).toBe(DEPART_BAF.arriveePrevue);
      expect(vue.suivi.find((s) => s.jalon === "disponible")).toMatchObject({
        estimee: true,
        fait: false,
        a: DEPART_BAF.arriveePrevue,
      });
    });
  });

  describe("envoyer le code", () => {
    it("renvoie le code au destinataire et répond par un accusé sans code (SchemaAccuseEnvoiCode)", async () => {
      const { colisId, code } = await creerColisApp(t, e);
      t.horloge.avancer(61_000);
      const avant = t.sms.messages().length;
      const rep = await t
        .http()
        .post(`/colis/${colisId}/code/envoi`)
        .set(entete(e.expediteur.jeton))
        .send({ canal: "sms" });
      expect(rep.status).toBe(200);
      const accuse = contrats.SchemaAccuseEnvoiCode.parse(rep.body);
      expect(accuse).toMatchObject({ colisId, canal: "sms", envoyeA: "···· 18 22" });
      expect(JSON.stringify(rep.body)).not.toContain(code);
      expect(t.sms.messages()).toHaveLength(avant + 1);
      expect(t.sms.dernier()).toMatchObject({ telephone: "+237699401822" });
      expect(codeDuSms(t.sms.dernier()!.message)).toBe(code);
    });

    it("limite l'envoi à un par minute", async () => {
      const { colisId } = await creerColisApp(t, e);
      const rep = await t
        .http()
        .post(`/colis/${colisId}/code/envoi`)
        .set(entete(e.expediteur.jeton))
        .send({});
      expect(rep.status).toBe(429);
      expect(rep.body.code).toBe("code_deja_envoye");
    });

    it("n'est pas permis au destinataire ni à un inconnu", async () => {
      const { colisId } = await creerColisApp(t, e);
      t.horloge.avancer(61_000);
      for (const compte of [e.destinataire, e.inconnu]) {
        const rep = await t
          .http()
          .post(`/colis/${colisId}/code/envoi`)
          .set(entete(compte.jeton))
          .send({});
        expect(rep.status).toBe(404);
      }
    });

    it("signale une panne d'envoi sans perdre le code", async () => {
      const { colisId, code } = await creerColisApp(t, e);
      t.horloge.avancer(61_000);
      const original = t.sms.envoyer.bind(t.sms);
      t.sms.envoyer = async () => {
        throw new Error("opérateur en panne");
      };
      const rep = await t
        .http()
        .post(`/colis/${colisId}/code/envoi`)
        .set(entete(e.expediteur.jeton))
        .send({});
      t.sms.envoyer = original;
      expect(rep.status).toBe(503);
      expect(rep.body.code).toBe("envoi_impossible");
      expect(JSON.stringify(rep.body)).not.toContain(code);
    });

    it("refuse un canal inconnu et accepte WhatsApp (envoyé par SMS en attendant le fournisseur)", async () => {
      const { colisId } = await creerColisApp(t, e);
      t.horloge.avancer(61_000);
      const mauvais = await t
        .http()
        .post(`/colis/${colisId}/code/envoi`)
        .set(entete(e.expediteur.jeton))
        .send({ canal: "pigeon" });
      expect(mauvais.status).toBe(400);
      const whatsapp = await t
        .http()
        .post(`/colis/${colisId}/code/envoi`)
        .set(entete(e.expediteur.jeton))
        .send({ canal: "whatsapp" });
      expect(whatsapp.status).toBe(200);
      expect(whatsapp.body.canal).toBe("sms");
    });

    it("n'a plus de sens une fois le colis remis", async () => {
      const { colisId, code } = await creerColisApp(t, e);
      await amenerJusquaDisponible(t, e, colisId);
      await scanner(t, e.guichetierBaf.jeton, {
        colisId,
        action: "remettre",
        code,
        pieceVerifiee: true,
        photoRef: "photos/remise-2.jpg",
      });
      t.horloge.avancer(61_000);
      const rep = await t
        .http()
        .post(`/colis/${colisId}/code/envoi`)
        .set(entete(e.expediteur.jeton))
        .send({});
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("colis_termine");
    });
  });

  describe("changer le mode de retrait", () => {
    it("passe en relais pour 300 F, encaissés comme le premier paiement (SchemaModeChange)", async () => {
      const { colisId } = await creerColisApp(t, e);
      const rep = await t
        .http()
        .put(`/colis/${colisId}/mode`)
        .set(entete(e.expediteur.jeton))
        .send({ mode: "relais", relaisId: POINT_RELAIS.id });
      expect(rep.status).toBe(200);
      expect(contrats.SchemaModeChange.parse(rep.body)).toEqual({
        colisId,
        mode: "relais",
        supplement: 300,
        devis: { total: 2500 },
      });
      expect(t.paiements.demandes.at(-1)).toMatchObject({
        montant: 300,
        moyen: "mtn_momo",
        numero: "+237691221008",
      });
      const stocke = await t.repo.trouver(colisId);
      expect(stocke).toMatchObject({ mode: "relais", relaisId: POINT_RELAIS.id, prixTotal: 2500 });
    });

    it("est idempotent : redemander le même mode ne coûte rien", async () => {
      const { colisId } = await creerColisApp(t, e);
      const corps = { mode: "moto", adresse: "Quartier Tamdja, Bafoussam" };
      const premier = await t
        .http()
        .put(`/colis/${colisId}/mode`)
        .set(entete(e.expediteur.jeton))
        .send(corps);
      expect(premier.body.supplement).toBe(1000);
      const paiements = t.paiements.demandes.length;
      const second = await t
        .http()
        .put(`/colis/${colisId}/mode`)
        .set(entete(e.expediteur.jeton))
        .send(corps);
      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({ mode: "moto", supplement: 0, devis: { total: 3200 } });
      expect(t.paiements.demandes).toHaveLength(paiements);
    });

    it("ne rembourse pas un relais déjà payé en passant à la moto : 1 000 − 300 = 700 F", async () => {
      const { colisId } = await creerColisApp(t, e);
      await t
        .http()
        .put(`/colis/${colisId}/mode`)
        .set(entete(e.expediteur.jeton))
        .send({ mode: "relais", relaisId: POINT_RELAIS.id });
      const rep = await t
        .http()
        .put(`/colis/${colisId}/mode`)
        .set(entete(e.expediteur.jeton))
        .send({ mode: "moto", adresse: "Rue 1.234" });
      expect(rep.body).toMatchObject({ mode: "moto", supplement: 700, devis: { total: 3200 } });
    });

    it("exige le relais ou l'adresse, refuse un paiement refusé, et un colis déjà remis", async () => {
      const { colisId, code } = await creerColisApp(t, e);
      const put = (corps: object) =>
        t.http().put(`/colis/${colisId}/mode`).set(entete(e.expediteur.jeton)).send(corps);
      expect((await put({ mode: "relais" })).body.code).toBe("relais_requis");
      expect((await put({ mode: "moto" })).body.code).toBe("adresse_requise");
      expect((await put({ mode: "relais", relaisId: "inconnu" })).status).toBe(404);
      expect((await put({ mode: "gare" })).status).toBe(400);

      t.paiements.refuser = true;
      const refuse = await put({ mode: "moto", adresse: "Rue 1" });
      expect(refuse.status).toBe(402);
      expect((await t.repo.trouver(colisId))?.mode).toBe("gare");
      t.paiements.refuser = false;

      await amenerJusquaDisponible(t, e, colisId);
      await scanner(t, e.guichetierBaf.jeton, {
        colisId,
        action: "remettre",
        code,
        pieceVerifiee: true,
        photoRef: "photos/remise-3.jpg",
      });
      const termine = await put({ mode: "moto", adresse: "Rue 1" });
      expect(termine.status).toBe(409);
      expect(termine.body.code).toBe("mode_non_modifiable");
    });

    it("n'est pas permis au destinataire", async () => {
      const { colisId } = await creerColisApp(t, e);
      const rep = await t
        .http()
        .put(`/colis/${colisId}/mode`)
        .set(entete(e.destinataire.jeton))
        .send({ mode: "moto", adresse: "Rue 2" });
      expect(rep.status).toBe(404);
    });
  });

  describe("suivi en direct", () => {
    it("diffuse chaque changement d'état à ceux qui suivent le colis", async () => {
      const { colisId } = await creerColisApp(t, e);
      const recus: unknown[] = [];
      const stop = await t.colis.suivreEnDirect(e.expediteur.id, colisId, (m) => recus.push(m));
      await scanner(t, e.guichetier.jeton, { colisId, action: "charger" });
      await scanner(t, e.convoyeur.jeton, { colisId, action: "expedier" });
      stop();
      await scanner(t, e.convoyeur.jeton, { colisId, action: "decharger" });
      expect(recus).toHaveLength(2);
      for (const m of recus) expect(contrats.SchemaMessageSuiviColis.parse(m)).toBeDefined();
      expect(recus.map((m) => (m as { jalon: string }).jalon)).toEqual(["charge", "en_route"]);
    });

    it("refuse le suivi d'un colis qui n'est pas à soi", async () => {
      const { colisId } = await creerColisApp(t, e);
      await expect(
        t.colis.suivreEnDirect(e.inconnu.id, colisId, () => undefined),
      ).rejects.toThrow();
    });
  });

  describe("réclamer", () => {
    it("ouvre une réclamation, réponse sous 2 jours ouvrés (SchemaReclamationOuverte)", async () => {
      const { colisId } = await creerColisApp(t, e);
      const rep = await t
        .http()
        .post(`/colis/${colisId}/reclamations`)
        .set(entete(e.expediteur.jeton))
        .send({ motif: "retard", message: "Le colis devait arriver hier" });
      expect(rep.status).toBe(201);
      const r = contrats.SchemaReclamationOuverte.parse(rep.body);
      expect(r.reference).toMatch(/^R-261102-[A-Z0-9]{6}$/);
      expect(r).toMatchObject({
        colisId,
        motif: "retard",
        ouverteLe: "2026-11-02T09:00:00.000+01:00",
        // Lundi 2 novembre : deux jours ouvrés plus tard, mercredi 4.
        reponseAvant: "2026-11-04T09:00:00.000+01:00",
      });
    });

    it("saute le week-end : ouverte le vendredi, réponse le mardi", async () => {
      const { colisId } = await creerColisApp(t, e);
      t.horloge.avancer(4 * 86_400_000); // vendredi 6 novembre
      const rep = await t
        .http()
        .post(`/colis/${colisId}/reclamations`)
        .set(entete(e.expediteur.jeton))
        .send({ motif: "autre" });
      expect(rep.body.reponseAvant).toBe("2026-11-10T09:00:00.000+01:00");
      t.horloge.avancer(-4 * 86_400_000);
    });

    it("ne double pas une réclamation ouverte pour le même motif", async () => {
      const { colisId } = await creerColisApp(t, e);
      const ouvrir = () =>
        t
          .http()
          .post(`/colis/${colisId}/reclamations`)
          .set(entete(e.expediteur.jeton))
          .send({ motif: "retard" });
      const a = await ouvrir();
      const b = await ouvrir();
      expect(b.body.reference).toBe(a.body.reference);
      expect(await t.reclamationsRepo.parColis(colisId)).toHaveLength(1);
    });

    it("met le colis en litige quand il est dit perdu ou abîmé", async () => {
      const { colisId } = await creerColisApp(t, e);
      await t
        .http()
        .post(`/colis/${colisId}/reclamations`)
        .set(entete(e.expediteur.jeton))
        .send({ motif: "abime" });
      expect((await t.repo.trouver(colisId))?.etat).toBe("litige");
    });

    it("refuse un motif inconnu, un message trop long et le colis d'un autre", async () => {
      const { colisId } = await creerColisApp(t, e);
      const post = (jeton: string, corps: object) =>
        t.http().post(`/colis/${colisId}/reclamations`).set(entete(jeton)).send(corps);
      expect((await post(e.expediteur.jeton, { motif: "vol" })).status).toBe(400);
      expect(
        (await post(e.expediteur.jeton, { motif: "autre", message: "x".repeat(1001) })).status,
      ).toBe(400);
      expect((await post(e.inconnu.jeton, { motif: "autre" })).status).toBe(404);
    });
  });
});
