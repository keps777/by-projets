import { randomUUID } from "node:crypto";
import { agence } from "@afrimove/contrats";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEPART_BAF,
  GARE_DLA,
  GUICHET_2,
  codeDuSms,
  creerAppColisTest,
  dernierSmsA,
  entete,
  evenementDepose,
  evenementEnregistre,
  type AppColisTest,
} from "./testing/app-colis-test";
import { creerColisApp, creerEquipe, type Equipe } from "./testing/scenarios";

const post = (t: AppColisTest, chemin: string, jeton: string, corps: unknown) =>
  t
    .http()
    .post(chemin)
    .set(entete(jeton))
    .send(corps as object);

describe("colis au guichet", () => {
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
    t.assureur.indisponible = false;
  });

  describe("formulaire (GuichetColis)", () => {
    it("donne le prochain numéro de la plage du guichet 2, les départs et le prix (SchemaColisFormulaire)", async () => {
      const rep = await t.http().get("/agence/colis/formulaire").set(entete(e.guichetier.jeton));
      expect(rep.status).toBe(200);
      const f = agence.SchemaColisFormulaire.parse(rep.body);
      expect(f.prochainNumero).toEqual({ sequence: 1001, numero: "C-DLA-261102-1001" });
      expect(f.guichet).toEqual({ id: GUICHET_2.id, rang: 2 });
      expect(f.departs).toEqual([
        {
          departId: DEPART_BAF.id,
          heureDepart: DEPART_BAF.heureDepart,
          destination: "Bafoussam",
          soutePct: 60,
        },
      ]);
      expect(f.autreVilleDisponible).toBe(true);
      expect(f.etiquette).toMatchObject({
        largeurMm: 58,
        hauteurMm: 40,
        trajet: { origine: "DLA", destination: "BAF" },
      });
      // En agence, les 150 F de frais sont à la charge de l'agence : le port seul.
      expect(f.devis).toEqual({
        lignes: [{ code: "port", libelle: "Port", montant: 1500 }],
        total: 1500,
      });
      expect(f.brouillon).toBeNull();
    });

    it("avance le numéro après chaque colis enregistré", async () => {
      const ev = evenementEnregistre(e.guichetier.id);
      expect((await post(t, "/agence/colis", e.guichetier.jeton, ev)).status).toBe(200);
      const rep = await t.http().get("/agence/colis/formulaire").set(entete(e.guichetier.jeton));
      expect(rep.body.prochainNumero).toEqual({ sequence: 1002, numero: "C-DLA-261102-1002" });
    });

    it("accepte un guichet nommé, refuse un guichet inconnu et un autre rôle", async () => {
      const nomme = await t
        .http()
        .get(`/agence/colis/formulaire?guichetId=${GUICHET_2.id}`)
        .set(entete(e.guichetier.jeton));
      expect(nomme.status).toBe(200);
      const inconnu = await t
        .http()
        .get("/agence/colis/formulaire?guichetId=nulle-part")
        .set(entete(e.guichetier.jeton));
      expect(inconnu.status).toBe(404);
      const voyageur = await t
        .http()
        .get("/agence/colis/formulaire")
        .set(entete(e.expediteur.jeton));
      expect(voyageur.status).toBe(403);
    });

    it("ne montre pas les départs fermés aux colis ni ceux d'une autre gare", async () => {
      t.referentiel.departs.set("autre-gare", {
        ...DEPART_BAF,
        id: "autre-gare",
        gareOrigine: { ...GARE_DLA, id: "ailleurs" },
      });
      t.referentiel.departs.set("ferme", { ...DEPART_BAF, id: "ferme", ouvertAuColis: false });
      const rep = await t.http().get("/agence/colis/formulaire").set(entete(e.guichetier.jeton));
      expect(rep.body.departs.map((d: { departId: string }) => d.departId)).toEqual([
        DEPART_BAF.id,
      ]);
      t.referentiel.departs.delete("autre-gare");
      t.referentiel.departs.delete("ferme");
    });
  });

  describe("enregistrer un colis (colis.enregistre)", () => {
    it("crée le colis, numéroté dans la plage de l'appareil, et envoie le code au destinataire seul", async () => {
      const ev = evenementEnregistre(e.guichetier.id, { numeroPlage: 1042 });
      expect(agence.EVENEMENT_COLIS_ENREGISTRE.schema.safeParse(ev).success).toBe(true);
      const rep = await post(t, "/agence/colis", e.guichetier.jeton, ev);
      expect(rep.status).toBe(200);
      const r = agence.SchemaResultatColis.parse(rep.body);
      expect(r.accuse).toMatchObject({ evenementId: ev["id"], statut: "accepte" });
      expect(r.colis).toMatchObject({
        numero: "C-DLA-261102-1042",
        sequence: 1042,
        etat: "enregistre",
        prixTotal: 2000,
        smsDestinataire: "envoye",
      });
      const sms = dernierSmsA(t, "+237699401822");
      expect(sms).toContain("C-DLA-261102-1042");
      const code = codeDuSms(sms!);
      // Ni la réponse, ni le SMS à l'expéditeur, ni aucun autre message ne porte le code.
      expect(JSON.stringify(rep.body)).not.toContain(code);
      expect(
        t.sms
          .messages()
          .filter((m) => m.telephone !== "+237699401822")
          .some((m) => m.message.includes(code)),
      ).toBe(false);
    });

    it("garde le colis déposé, avec sa photo et son assurance", async () => {
      const ev = evenementEnregistre(e.guichetier.id, {
        numeroPlage: 1050,
        donnees: { photoRef: "photos/guichet-1050.jpg" },
      });
      await post(t, "/agence/colis", e.guichetier.jeton, ev);
      const colis = (await t.repo.trouver((ev["donnees"] as { colisId: string }).colisId))!;
      expect(colis).toMatchObject({
        canal: "agence",
        mode: "gare",
        etat: "enregistre",
        prixTotal: 2000,
        expediteurId: null,
        depose: { photoRef: "photos/guichet-1050.jpg", par: e.guichetier.id },
        evenementIds: [ev["id"]],
      });
      expect(colis.assurance.police).toMatch(/^POL-/);
      expect((await t.photos.parColis(colis.id))[0]).toMatchObject({ genre: "depot" });
    });

    it("rejouer le même événement répond deja_recu sans rien refaire", async () => {
      const ev = evenementEnregistre(e.guichetier.id, { numeroPlage: 1060 });
      const premier = await post(t, "/agence/colis", e.guichetier.jeton, ev);
      const nombre = t.repo.lignes.size;
      const sms = t.sms.messages().length;
      const polices = t.assureur.polices.length;
      const second = await post(t, "/agence/colis", e.guichetier.jeton, ev);
      expect(second.status).toBe(200);
      expect(second.body.accuse).toMatchObject({ evenementId: ev["id"], statut: "deja_recu" });
      expect(second.body.colis).toEqual(premier.body.colis);
      expect(t.repo.lignes.size).toBe(nombre);
      expect(t.sms.messages()).toHaveLength(sms);
      expect(t.assureur.polices).toHaveLength(polices);
    });

    it("refuse un autre événement pour un colis déjà enregistré, et un numéro déjà pris", async () => {
      const ev = evenementEnregistre(e.guichetier.id, { numeroPlage: 1070 });
      await post(t, "/agence/colis", e.guichetier.jeton, ev);
      const memeColis = evenementEnregistre(e.guichetier.id, {
        colisId: (ev["donnees"] as { colisId: string }).colisId,
        numeroPlage: 1071,
      });
      const doublon = await post(t, "/agence/colis", e.guichetier.jeton, memeColis);
      expect(doublon.status).toBe(409);
      expect(doublon.body.code).toBe("COLIS_DEJA_ENREGISTRE");

      const memeNumero = evenementEnregistre(e.guichetier.id, { numeroPlage: 1070 });
      const pris = await post(t, "/agence/colis", e.guichetier.jeton, memeNumero);
      expect(pris.status).toBe(409);
      expect(pris.body.code).toBe("NUMERO_PRIS");
    });

    it("refuse un montant encaissé qui n'est pas le prix du colis (PAIEMENT_INVALIDE)", async () => {
      const ev = evenementEnregistre(e.guichetier.id, {
        numeroPlage: 1080,
        donnees: { paiement: { mode: "cash", montant: 1500 } },
      });
      const rep = await post(t, "/agence/colis", e.guichetier.jeton, ev);
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("PAIEMENT_INVALIDE");
      expect(rep.body.details).toEqual({ attendu: 2000 });
      expect(await t.repo.trouver((ev["donnees"] as { colisId: string }).colisId)).toBeNull();
    });

    it("n'assure pas : le prix est celui du port seul, sans souscription", async () => {
      const polices = t.assureur.polices.length;
      const ev = evenementEnregistre(e.guichetier.id, {
        numeroPlage: 1090,
        donnees: { assure: false, paiement: { mode: "momo", montant: 1500 } },
      });
      const rep = await post(t, "/agence/colis", e.guichetier.jeton, ev);
      expect(rep.status).toBe(200);
      expect(rep.body.colis.prixTotal).toBe(1500);
      expect(t.assureur.polices).toHaveLength(polices);
    });

    it("refuse l'événement d'une autre personne, d'une autre gare, d'un départ inconnu ou fermé", async () => {
      const autrui = await post(
        t,
        "/agence/colis",
        e.guichetier.jeton,
        evenementEnregistre(e.guichetierBaf.id, { numeroPlage: 1100 }),
      );
      expect(autrui.status).toBe(403);
      expect(autrui.body.code).toBe("AUTEUR_INCOHERENT");

      const autreGare = await post(
        t,
        "/agence/colis",
        e.guichetierBaf.jeton,
        evenementEnregistre(e.guichetierBaf.id, { numeroPlage: 1101 }),
      );
      expect(autreGare.status).toBe(403);
      expect(autreGare.body.code).toBe("AUTRE_GARE");

      const inconnu = await post(
        t,
        "/agence/colis",
        e.guichetier.jeton,
        evenementEnregistre(e.guichetier.id, { numeroPlage: 1102, donnees: { departId: "nul" } }),
      );
      expect(inconnu.status).toBe(404);
      expect(inconnu.body.code).toBe("DEPART_INCONNU");

      t.referentiel.departs.set("ferme", { ...DEPART_BAF, id: "ferme", ouvertAuColis: false });
      const ferme = await post(
        t,
        "/agence/colis",
        e.guichetier.jeton,
        evenementEnregistre(e.guichetier.id, { numeroPlage: 1103, donnees: { departId: "ferme" } }),
      );
      expect(ferme.status).toBe(422);
      t.referentiel.departs.delete("ferme");
    });

    it("refuse l'événement d'un voyageur, d'une compagnie étrangère et un corps illisible", async () => {
      const ev = evenementEnregistre(e.expediteur.id, { numeroPlage: 1110 });
      expect((await post(t, "/agence/colis", e.expediteur.jeton, ev)).status).toBe(403);

      const etranger = await t.compte("guichetier", {
        compagnieId: "00000000-0000-4000-8000-0000000000c2",
        gareId: GARE_DLA.id,
      });
      const refus = await post(
        t,
        "/agence/colis",
        etranger.jeton,
        evenementEnregistre(etranger.id, { numeroPlage: 1111 }),
      );
      expect(refus.status).toBe(404);

      const illisible = await post(t, "/agence/colis", e.guichetier.jeton, {
        ...evenementEnregistre(e.guichetier.id),
        id: "pas-un-uuid",
        numeroPlage: 12_000,
      });
      expect(illisible.status).toBe(400);
      const chemins = illisible.body.details.map((d: { chemin: string }) => d.chemin);
      expect(chemins).toEqual(expect.arrayContaining(["id", "numeroPlage"]));
    });

    it("enregistre l'événement au journal sans les téléphones", async () => {
      const ev = evenementEnregistre(e.guichetier.id, { numeroPlage: 1120 });
      await post(t, "/agence/colis", e.guichetier.jeton, ev);
      const ligne = t.evenements.lignes.get(ev["id"] as string);
      expect(ligne).toMatchObject({ type: "colis.enregistre", numeroPlage: 1120 });
      expect(JSON.stringify(ligne)).not.toMatch(/\+237\d{9}/);
    });

    it("garde 'au retour du réseau' quand le SMS ne part pas, puis le renvoie", async () => {
      const original = t.sms.envoyer.bind(t.sms);
      t.sms.envoyer = async () => {
        throw new Error("opérateur en panne");
      };
      const ev = evenementEnregistre(e.guichetier.id, { numeroPlage: 1130 });
      const rep = await post(t, "/agence/colis", e.guichetier.jeton, ev);
      t.sms.envoyer = original;
      expect(rep.status).toBe(200);
      expect(rep.body.colis.smsDestinataire).toBe("au_retour_du_reseau");

      const avant = t.sms.messages().length;
      expect(await t.taches.renvoyerCodes()).toBeGreaterThanOrEqual(1);
      expect(t.sms.messages().length).toBeGreaterThan(avant);
      const colis = await t.repo.trouver((ev["donnees"] as { colisId: string }).colisId);
      expect(colis?.code.smsDestinataire).toBe("envoye");
      expect(await t.taches.renvoyerCodes()).toBe(0);
    });

    it("garde l'assurance en attente si l'assureur ne répond pas, et la souscrit plus tard", async () => {
      t.assureur.indisponible = true;
      const ev = evenementEnregistre(e.guichetier.id, { numeroPlage: 1140 });
      const rep = await post(t, "/agence/colis", e.guichetier.jeton, ev);
      expect(rep.status).toBe(200);
      const id = (ev["donnees"] as { colisId: string }).colisId;
      expect((await t.repo.trouver(id))?.assurance).toEqual({ police: null, enAttente: true });

      t.assureur.indisponible = false;
      expect(await t.taches.rejouerAssurances()).toBeGreaterThanOrEqual(1);
      expect((await t.repo.trouver(id))?.assurance.enAttente).toBe(false);
      expect((await t.repo.trouver(id))?.assurance.police).toMatch(/^POL-/);
    });
  });

  describe("dépôt prépayé (Depot)", () => {
    it("retrouve le colis par le code lu à l'écran du client (SchemaColisDepot)", async () => {
      const { colisId, numero } = await creerColisApp(t, e);
      const lu = numero.replace("C-", "C-ALP-");
      for (const code of [numero, lu]) {
        const rep = await t
          .http()
          .get(`/agence/colis/depot?code=${encodeURIComponent(code)}`)
          .set(entete(e.guichetier.jeton));
        expect(rep.status, code).toBe(200);
        const d = agence.SchemaColisDepot.parse(rep.body);
        expect(d).toMatchObject({
          colisId,
          numero,
          codeLu: code,
          etat: "enregistre",
          payeDansApp: 2200,
          expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
          destinataire: { nom: "Ngo Thérèse", destination: "Bafoussam gare" },
          declare: {
            contenu: "Médicaments et vêtements",
            poidsKg: 2,
            valeurDeclaree: 25000,
            assure: true,
          },
          depart: { departId: DEPART_BAF.id, destination: "Bafoussam", soutePct: 60 },
          verifications: {
            poidsReleveKg: null,
            poidsConforme: null,
            photoRequise: true,
            seuilDepassementKg: 1,
          },
        });
        // Le guichet ne voit jamais le code de retrait.
        expect(JSON.stringify(rep.body)).not.toMatch(/codeRetrait|hache|"sel"/);
      }
    });

    it("répond 404 à un code inconnu, mal formé, ou à un colis déposé au guichet", async () => {
      const get = (code: string) =>
        t
          .http()
          .get(`/agence/colis/depot?code=${encodeURIComponent(code)}`)
          .set(entete(e.guichetier.jeton));
      expect((await get("C-DLA-261102-9999")).status).toBe(404);
      expect((await get("n'importe quoi")).status).toBe(404);
      const ev = evenementEnregistre(e.guichetier.id, { numeroPlage: 1150 });
      await post(t, "/agence/colis", e.guichetier.jeton, ev);
      expect((await get("C-DLA-261102-1150")).status).toBe(404);
      const sansCode = await t.http().get("/agence/colis/depot").set(entete(e.guichetier.jeton));
      expect(sansCode.status).toBe(400);
    });

    it("refuse le colis d'une autre gare (403) ou d'une autre compagnie (404)", async () => {
      const { numero } = await creerColisApp(t, e);
      const get = (jeton: string) =>
        t.http().get(`/agence/colis/depot?code=${numero}`).set(entete(jeton));
      expect((await get(e.guichetierBaf.jeton)).status).toBe(403);
      const etranger = await t.compte("guichetier", {
        compagnieId: "00000000-0000-4000-8000-0000000000c2",
        gareId: GARE_DLA.id,
      });
      expect((await get(etranger.jeton)).status).toBe(404);
    });
  });

  describe("accepter le dépôt (colis.depose)", () => {
    it("accepte un poids conforme sans complément (SchemaResultatDepot)", async () => {
      const { colisId } = await creerColisApp(t, e, { photoRef: "photos/envoi-conforme.jpg" });
      const ev = evenementDepose(e.guichetier.id, colisId, {
        poidsReleveKg: 2.1,
        photoRef: "photos/depot-conforme.jpg",
      });
      expect(agence.EVENEMENT_COLIS_DEPOSE.schema.safeParse(ev).success).toBe(true);
      const rep = await post(t, "/agence/colis/depot", e.guichetier.jeton, ev);
      expect(rep.status).toBe(200);
      const r = agence.SchemaResultatDepot.parse(rep.body);
      expect(r.accuse.statut).toBe("accepte");
      expect(r.complementDemande).toBe(0);
      expect(r.colis).toMatchObject({ colisId, prixTotal: 2200, smsDestinataire: "envoye" });

      const lu = await t
        .http()
        .get(`/agence/colis/depot?code=${r.colis.numero}`)
        .set(entete(e.guichetier.jeton));
      expect(lu.body.verifications).toMatchObject({
        poidsReleveKg: 2.1,
        poidsConforme: true,
        photoRequise: false,
      });
      const stocke = await t.repo.trouver(colisId);
      expect(stocke?.depose).toMatchObject({
        poidsReleveKg: 2.1,
        photoRef: "photos/depot-conforme.jpg",
      });
      expect((await t.photos.parColis(colisId)).map((p) => p.genre).sort()).toEqual([
        "depot",
        "envoi",
      ]);
    });

    it("exige un complément au-delà de 1 kg de dépassement, et l'ajoute au prix", async () => {
      const { colisId } = await creerColisApp(t, e);
      const sans = await post(
        t,
        "/agence/colis/depot",
        e.guichetier.jeton,
        evenementDepose(e.guichetier.id, colisId, { poidsReleveKg: 3.5 }),
      );
      expect(sans.status).toBe(422);
      expect(sans.body.code).toBe("COMPLEMENT_REQUIS");
      expect((await t.repo.trouver(colisId))?.depose).toBeNull();

      const avec = await post(
        t,
        "/agence/colis/depot",
        e.guichetier.jeton,
        evenementDepose(e.guichetier.id, colisId, { poidsReleveKg: 3.5, complement: 600 }),
      );
      expect(avec.status).toBe(200);
      expect(agence.SchemaResultatDepot.parse(avec.body).complementDemande).toBe(600);
      expect(avec.body.colis.prixTotal).toBe(2800);
      const stocke = await t.repo.trouver(colisId);
      expect(stocke?.complementPoids).toBe(600);
      expect(stocke?.devis.at(-1)).toEqual({
        code: "complement_poids",
        libelle: "Complément de poids",
        montant: 600,
      });
    });

    it("tolère exactement 1 kg de dépassement, mais refuse un complément quand il n'est pas dû", async () => {
      const { colisId } = await creerColisApp(t, e);
      const indu = await post(
        t,
        "/agence/colis/depot",
        e.guichetier.jeton,
        evenementDepose(e.guichetier.id, colisId, { poidsReleveKg: 3, complement: 500 }),
      );
      expect(indu.status).toBe(422);
      expect(indu.body.code).toBe("COMPLEMENT_INDU");
      const pile = await post(
        t,
        "/agence/colis/depot",
        e.guichetier.jeton,
        evenementDepose(e.guichetier.id, colisId, { poidsReleveKg: 3 }),
      );
      expect(pile.status).toBe(200);
    });

    it("rejouer l'événement répond deja_recu, un autre événement pour le même colis est refusé", async () => {
      const { colisId } = await creerColisApp(t, e);
      const ev = evenementDepose(e.guichetier.id, colisId);
      const premier = await post(t, "/agence/colis/depot", e.guichetier.jeton, ev);
      const second = await post(t, "/agence/colis/depot", e.guichetier.jeton, ev);
      expect(second.body.accuse.statut).toBe("deja_recu");
      expect(second.body.colis).toEqual(premier.body.colis);
      const autre = await post(
        t,
        "/agence/colis/depot",
        e.guichetier.jeton,
        evenementDepose(e.guichetier.id, colisId),
      );
      expect(autre.status).toBe(409);
      expect(autre.body.code).toBe("DEJA_DEPOSE");
    });

    it("refuse un colis impayé, inconnu, d'une autre gare, ou venu du guichet", async () => {
      t.paiements.enAttente = true;
      const impaye = await creerColisApp(t, e);
      t.paiements.enAttente = false;
      const refus = await post(
        t,
        "/agence/colis/depot",
        e.guichetier.jeton,
        evenementDepose(e.guichetier.id, impaye.colisId),
      );
      expect(refus.status).toBe(402);
      expect(refus.body.code).toBe("PAIEMENT_EN_ATTENTE");

      const inconnu = await post(
        t,
        "/agence/colis/depot",
        e.guichetier.jeton,
        evenementDepose(e.guichetier.id, randomUUID()),
      );
      expect(inconnu.status).toBe(404);

      const { colisId } = await creerColisApp(t, e);
      const autreGare = await post(
        t,
        "/agence/colis/depot",
        e.guichetierBaf.jeton,
        evenementDepose(e.guichetierBaf.id, colisId),
      );
      expect(autreGare.status).toBe(403);

      const ev = evenementEnregistre(e.guichetier.id, { numeroPlage: 1160 });
      await post(t, "/agence/colis", e.guichetier.jeton, ev);
      const duGuichet = await post(
        t,
        "/agence/colis/depot",
        e.guichetier.jeton,
        evenementDepose(e.guichetier.id, (ev["donnees"] as { colisId: string }).colisId),
      );
      expect(duGuichet.status).toBe(404);
    });

    it("réessaie d'envoyer le code si le SMS n'était pas parti à la création", async () => {
      const original = t.sms.envoyer.bind(t.sms);
      t.sms.envoyer = async () => {
        throw new Error("opérateur en panne");
      };
      const { colisId, code } = await creerColisApp(t, e);
      t.sms.envoyer = original;
      expect((await t.repo.trouver(colisId))?.code.smsDestinataire).toBe("au_retour_du_reseau");
      const rep = await post(
        t,
        "/agence/colis/depot",
        e.guichetier.jeton,
        evenementDepose(e.guichetier.id, colisId),
      );
      expect(rep.body.colis.smsDestinataire).toBe("envoye");
      expect(codeDuSms(dernierSmsA(t, "+237699401822")!)).toBe(code);
    });
  });

  it("le contrat refuse un identifiant d'événement qui n'est pas un UUID", () => {
    const ev = evenementEnregistre(e.guichetier.id);
    expect(agence.EVENEMENT_COLIS_ENREGISTRE.schema.safeParse({ ...ev, id: "x" }).success).toBe(
      false,
    );
  });
});
