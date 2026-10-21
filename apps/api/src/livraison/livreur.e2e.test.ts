import { colis as contrats } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIEN_SUIVI } from "./livraison.service";
import {
  amenerJusquaDisponible,
  creerAppLivraisonTest,
  creerColis,
  creerEquipeRelais,
  dernierSmsA,
  entete,
  type AppLivraisonTest,
  type ColisCree,
  type EquipeRelais,
} from "./testing/app-livraison-test";

const HEURE = 3600_000;
const MINUTE = 60_000;

describe("livraison moto : écran du client, suivi partagé, gains du livreur", () => {
  let t: AppLivraisonTest;
  let e: EquipeRelais;

  beforeEach(async () => {
    t = await creerAppLivraisonTest();
    e = await creerEquipeRelais(t);
  });
  afterEach(async () => {
    await t.fermer();
  });

  async function colisMoto(over: Record<string, unknown> = {}): Promise<ColisCree> {
    const colis = await creerColis(t, e, {
      mode: "moto",
      adresseLivraison: "Tamdja, Bafoussam",
      ...over,
    });
    await amenerJusquaDisponible(t, e, colis.colisId);
    return colis;
  }

  /** Un livreur qui a accepté la course de ce colis. */
  async function livraisonEnCours() {
    const livreur = await t.creerLivreur({ nom: "Éric Tchoua" });
    const colis = await colisMoto();
    await t.missions.ouvrirMissions();
    const mission = [...t.missionsRepo.lignes.values()][0]!;
    const rep = await t
      .http()
      .post(`/livreurs/moi/missions/${mission.id}/acceptation`)
      .set(entete(livreur.compte.jeton));
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    return { livreur, colis, missionId: mission.id };
  }

  const voir = (jeton: string, colisId: string) =>
    t.http().get(`/colis/${colisId}/livraison`).set(entete(jeton));
  const partager = (jeton: string, colisId: string, destinataire = "+237677000111") =>
    t.http().post(`/colis/${colisId}/livraison/partage`).set(entete(jeton)).send({ destinataire });
  const suivreAvecLien = (lien: string) => t.http().get(`/suivi/${lien.replace(LIEN_SUIVI, "")}`);

  describe("l'écran « Livraison moto en cours »", () => {
    it("n'existe pas tant que le livreur n'a pas le colis", async () => {
      await t.creerLivreur();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const rep = await voir(e.expediteur.jeton, colis.colisId);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("pas_en_livraison");
    });

    it("montre le livreur, le prix, le code à donner, et le relais de repli, conformément au contrat", async () => {
      const { relais } = await t.creerRelais();
      const { colis, livreur } = await livraisonEnCours();

      for (const voyageur of [e.expediteur, e.destinataire]) {
        const rep = await voir(voyageur.jeton, colis.colisId);
        expect(rep.status, JSON.stringify(rep.body)).toBe(200);
        const vue = contrats.SchemaLivraisonColis.parse(rep.body);
        expect(vue).toMatchObject({
          colisId: colis.colisId,
          numero: colis.numero,
          statut: "en_livraison",
          carte: { livreurMinutes: 10, arrivee: "Tamdja, Bafoussam" },
          livreur: {
            id: livreur.livreur.id,
            nom: "Éric Tchoua",
            initiales: "ÉT",
            verifie: true,
            note: 5,
            livraisons: 0,
            moto: "OU 517 MT",
            gilet: livreur.livreur.numero,
          },
          remise: {
            destinataireALeCode: true,
            code: colis.code,
            attenteAbsenceMinutes: 10,
            relaisDeRepli: relais.nom,
          },
          prix: { livraison: 1000, payee: true, partLivreur: 700 },
        });
        expect(vue.devenir.detail).toContain("700 F");
      }
    });

    it("n'est visible que de l'expéditeur et du destinataire", async () => {
      const { colis } = await livraisonEnCours();
      expect((await voir(e.inconnu.jeton, colis.colisId)).status).toBe(404);
      expect((await voir(e.guichetierBaf.jeton, colis.colisId)).status).toBe(403);
      expect((await t.http().get(`/colis/${colis.colisId}/livraison`)).status).toBe(401);
    });

    it("le temps restant diminue avec l'horloge", async () => {
      const { colis } = await livraisonEnCours();
      t.horloge.avancer(4 * MINUTE);
      const rep = await voir(e.expediteur.jeton, colis.colisId);
      expect(rep.body.carte.livreurMinutes).toBe(6);
      t.horloge.avancer(20 * MINUTE);
      expect((await voir(e.expediteur.jeton, colis.colisId)).body.carte.livreurMinutes).toBe(0);
    });
  });

  describe("partage du suivi", () => {
    it("envoie un lien public par SMS : il montre la position du livreur, jamais le code ni les noms", async () => {
      const { colis } = await livraisonEnCours();
      const rep = await partager(e.expediteur.jeton, colis.colisId);
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      const vue = contrats.SchemaSuiviPartage.parse(rep.body);
      expect(vue.lien.startsWith(LIEN_SUIVI)).toBe(true);
      expect(vue.envoyeA).not.toContain("677000111");
      expect(dernierSmsA(t, "+237677000111")).toContain(vue.lien);

      // Sans compte, avec le seul lien.
      const public_ = await suivreAvecLien(vue.lien);
      expect(public_.status, JSON.stringify(public_.body)).toBe(200);
      expect(public_.body).toMatchObject({
        numero: colis.numero,
        statut: "en_livraison",
        minutesRestantes: 10,
        livreur: { initiales: "ÉT" },
      });
      const texte = JSON.stringify(public_.body);
      for (const interdit of [colis.code, "Thérèse", "Aïcha", "Tamdja", "+237", "Tchoua"]) {
        expect(texte, interdit).not.toContain(interdit);
      }
      expect(contrats.fuitesCodeRetrait(public_.body, [colis.code])).toEqual([]);
    });

    it("ne garde que l'empreinte du jeton, et un jeton deviné ne donne rien", async () => {
      const { colis } = await livraisonEnCours();
      const { body } = await partager(e.destinataire.jeton, colis.colisId);
      const jeton = (body.lien as string).replace(LIEN_SUIVI, "");
      expect(jeton.length).toBeGreaterThanOrEqual(32);
      const stocke = JSON.stringify([...t.partages.lignes.values()]);
      expect(stocke).not.toContain(jeton);
      expect([...t.partages.lignes.keys()][0]).toMatch(/^[0-9a-f]{64}$/);

      expect((await t.http().get("/suivi/inconnu")).status).toBe(404);
      expect((await t.http().get(`/suivi/${jeton}x`)).status).toBe(404);
      expect((await t.http().get(`/suivi/${jeton.toUpperCase()}`)).status).toBe(404);
    });

    it("le lien expire après 24 heures, et le colis livré le dit sans rien montrer d'autre", async () => {
      const { colis, livreur, missionId } = await livraisonEnCours();
      const { body } = await partager(e.expediteur.jeton, colis.colisId);
      t.horloge.avancer(24 * HEURE - MINUTE);
      expect((await suivreAvecLien(body.lien)).status).toBe(200);

      await t
        .http()
        .post(`/livreurs/moi/missions/${missionId}/remise`)
        .set(entete(livreur.compte.jeton))
        .send({ code: colis.code, pieceVerifiee: true, photoRef: "photos/r.jpg" })
        .expect(200);
      const livre = await suivreAvecLien(body.lien);
      expect(livre.body).toMatchObject({ statut: "livre", minutesRestantes: 0, livreur: null });

      t.horloge.avancer(MINUTE);
      const expire = await suivreAvecLien(body.lien);
      expect(expire.status).toBe(404);
      expect(expire.body.code).toBe("lien_introuvable");
    });

    it("cinq liens par colis au plus, et jamais pour un colis qui n'est pas en livraison", async () => {
      const { colis } = await livraisonEnCours();
      for (let i = 0; i < 5; i++) {
        expect((await partager(e.expediteur.jeton, colis.colisId)).status).toBe(201);
      }
      const sixieme = await partager(e.expediteur.jeton, colis.colisId);
      expect(sixieme.status).toBe(429);
      expect(sixieme.body.code).toBe("partages_epuises");
      expect(t.partages.lignes.size).toBe(5);

      const autre = await colisMoto();
      expect((await partager(e.expediteur.jeton, autre.colisId)).status).toBe(409);
      expect((await partager(e.inconnu.jeton, colis.colisId)).status).toBe(404);
    });

    it("refuse un numéro invalide, et ne crée pas de lien quand le SMS ne part pas", async () => {
      const { colis } = await livraisonEnCours();
      expect((await partager(e.expediteur.jeton, colis.colisId, "677000111")).status).toBe(400);
      const envoyer = t.sms.envoyer.bind(t.sms);
      t.sms.envoyer = async () => {
        throw new Error("fournisseur SMS en panne");
      };
      const rep = await partager(e.expediteur.jeton, colis.colisId);
      t.sms.envoyer = envoyer;
      expect(rep.status).toBe(503);
      expect(t.partages.lignes.size).toBe(0);
    });
  });

  describe("changement d'adresse", () => {
    const changer = (jeton: string, colisId: string, corps: Record<string, unknown>) =>
      t.http().put(`/colis/${colisId}/livraison/adresse`).set(entete(jeton)).send(corps);

    it("prévient le livreur qui a la course et met à jour la mission", async () => {
      const { colis, livreur, missionId } = await livraisonEnCours();
      const rep = await changer(e.destinataire.jeton, colis.colisId, {
        adresse: "Quartier Djeleng",
      });
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(rep.body).toEqual({
        colisId: colis.colisId,
        adresse: "Quartier Djeleng",
        livreurPrevenu: true,
      });
      expect(dernierSmsA(t, livreur.compte.telephone)).toContain("Quartier Djeleng");
      expect((await t.repo.trouver(colis.colisId))?.adresseLivraison).toBe("Quartier Djeleng");
      expect(t.missionsRepo.lignes.get(missionId)?.trajet.arrivee).toBe("Quartier Djeleng");
    });

    it("avant l'acceptation, le livreur n'est pas encore concerné", async () => {
      await t.creerLivreur();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const rep = await changer(e.expediteur.jeton, colis.colisId, { adresse: "Quartier Djeleng" });
      expect(rep.body.livreurPrevenu).toBe(false);
    });

    it("refuse un colis qui n'est pas en livraison moto, une adresse vide ou un tiers", async () => {
      const gare = await creerColis(t, e);
      expect((await changer(e.expediteur.jeton, gare.colisId, { adresse: "Ici" })).status).toBe(
        409,
      );
      const moto = await colisMoto();
      expect((await changer(e.expediteur.jeton, moto.colisId, { adresse: "" })).status).toBe(400);
      expect((await changer(e.expediteur.jeton, moto.colisId, {})).status).toBe(400);
      expect((await changer(e.inconnu.jeton, moto.colisId, { adresse: "Ici" })).status).toBe(404);
      expect((await t.repo.trouver(moto.colisId))?.adresseLivraison).toBe("Tamdja, Bafoussam");
    });
  });

  describe("espace du livreur", () => {
    it("montre ses pièces, sa disponibilité et la mission acceptée qu'il peut reprendre", async () => {
      const { livreur, missionId } = await livraisonEnCours();
      const espace = await t.http().get("/livreurs/moi").set(entete(livreur.compte.jeton));
      const vue = contrats.SchemaEspaceLivreur.parse(espace.body);
      expect(vue.mission).toBeNull(); // le contrat ne montre que la proposition en cours
      expect(vue.pieces).toEqual({
        aJour: true,
        liste: [
          { type: "permis", libelle: "Permis", valeur: "valide 2030" },
          { type: "assurance-moto", libelle: "Assurance moto", valeur: "expire 12/27" },
          {
            type: "gilet-casque",
            libelle: "Gilet · casque",
            valeur: `badge n° ${livreur.livreur.numero}`,
          },
        ],
      });

      const reprise = await t
        .http()
        .get("/livreurs/moi/missions/en-cours")
        .set(entete(livreur.compte.jeton));
      expect(reprise.status).toBe(200);
      expect(reprise.body.mission).toMatchObject({ id: missionId, remiseContreCode: true });
      contrats.SchemaMissionLivraison.parse(reprise.body.mission);
    });

    it("signale des pièces périmées", async () => {
      const { compte } = await t.creerLivreur({
        pieces: {
          permisRef: "p",
          assuranceRef: "a",
          permisValideJusqua: "2030-01-31",
          assuranceExpireLe: "2026-11-01",
        },
      });
      const rep = await t.http().get("/livreurs/moi").set(entete(compte.jeton));
      expect(rep.body.pieces.aJour).toBe(false);
      // Le jour même de l'échéance, l'assurance vaut encore.
      t.horloge.regler(new Date("2026-10-31T08:00:00.000Z"));
      expect(
        (await t.http().get("/livreurs/moi").set(entete(compte.jeton))).body.pieces.aJour,
      ).toBe(true);
    });

    it("se met en ligne et hors ligne : hors ligne, il ne reçoit plus de course", async () => {
      const a = await t.creerLivreur({ numero: 1 });
      const b = await t.creerLivreur({ numero: 2 });
      const dispo = (jeton: string, corps: unknown) =>
        t
          .http()
          .put("/livreurs/moi/disponibilite")
          .set(entete(jeton))
          .send(corps as object);

      const rep = await dispo(a.compte.jeton, { disponible: false });
      expect(rep.status).toBe(200);
      expect(contrats.SchemaDisponibiliteLivreur.parse(rep.body)).toEqual({ disponible: false });
      expect((await dispo(a.compte.jeton, { disponible: false })).status).toBe(200);
      expect((await dispo(a.compte.jeton, { disponible: "non" })).status).toBe(400);
      expect((await dispo(e.expediteur.jeton, { disponible: true })).status).toBe(403);

      await colisMoto();
      await t.missions.ouvrirMissions();
      expect(
        (await t.http().get("/livreurs/moi").set(entete(a.compte.jeton))).body.mission,
      ).toBeNull();
      expect(
        (await t.http().get("/livreurs/moi").set(entete(b.compte.jeton))).body.mission,
      ).not.toBeNull();
      await dispo(a.compte.jeton, { disponible: true });
      expect((await t.livreursRepo.trouver(a.livreur.id))?.disponible).toBe(true);
    });
  });

  describe("retrait des gains (dès 5 000 F)", () => {
    const retirer = (jeton: string, corps: Record<string, unknown> = {}) =>
      t.http().post("/livreurs/moi/retraits").set(entete(jeton)).send(corps);
    const soldeDe = (id: string) => t.portefeuille.solde("livreur", id);
    async function avoir(id: string, montant: number, cle = `seed:${montant}`) {
      await t.portefeuille.crediter({
        cle,
        type: "livreur",
        partenaireId: id,
        montant,
        motif: "livraison",
        reference: "seed",
        at: t.missions.maintenant(),
      });
    }

    it("refuse sous 5 000 F, sans rien envoyer à l'opérateur", async () => {
      const { livreur, compte } = await t.creerLivreur();
      await avoir(livreur.id, 4999);
      const rep = await retirer(compte.jeton);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("solde_insuffisant");
      expect(t.operateur.envoyes).toHaveLength(0);
      expect(await soldeDe(livreur.id)).toBe(4999);
    });

    it("à 5 000 F verse tout le solde sur le MoMo du livreur", async () => {
      const { livreur, compte } = await t.creerLivreur();
      await avoir(livreur.id, 5000);
      const rep = await retirer(compte.jeton);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaRetraitGains.parse(rep.body);
      expect(vue.montant).toBe(5000);
      expect(vue.moyen).toContain("MoMo");
      expect(vue.moyen).not.toContain("670000222");
      expect(t.operateur.envoyes).toHaveLength(1);
      expect(t.operateur.envoyes[0]).toMatchObject({
        montant: 5000,
        telephone: "+237670000222",
        operateur: "mtn",
      });
      expect(await soldeDe(livreur.id)).toBe(0);
    });

    it("un retrait partiel laisse le reste, qui ne peut plus être retiré s'il est sous le seuil", async () => {
      const { livreur, compte } = await t.creerLivreur();
      await avoir(livreur.id, 8000);
      expect((await retirer(compte.jeton, { montant: 5000 })).status).toBe(200);
      expect(await soldeDe(livreur.id)).toBe(3000);
      expect((await retirer(compte.jeton, { montant: 3000 })).status).toBe(409);
      expect((await retirer(compte.jeton)).status).toBe(409);
      expect(t.operateur.envoyes.map((v) => v.montant)).toEqual([5000]);
    });

    it("refuse un montant au-dessus du solde, nul ou négatif", async () => {
      const { livreur, compte } = await t.creerLivreur();
      await avoir(livreur.id, 6000);
      expect((await retirer(compte.jeton, { montant: 6001 })).status).toBe(409);
      expect((await retirer(compte.jeton, { montant: 0 })).status).toBe(422);
      expect((await retirer(compte.jeton, { montant: -5 })).status).toBe(400);
      expect((await retirer(compte.jeton, { montant: 5000.5 })).status).toBe(400);
      expect(await soldeDe(livreur.id)).toBe(6000);
      expect(t.operateur.envoyes).toHaveLength(0);
    });

    it("deux retraits simultanés ne dépensent pas deux fois le même solde", async () => {
      const { livreur, compte } = await t.creerLivreur();
      await avoir(livreur.id, 6000);
      const reponses = await Promise.all([retirer(compte.jeton), retirer(compte.jeton)]);
      expect(reponses.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(t.operateur.envoyes).toHaveLength(1);
      expect(await soldeDe(livreur.id)).toBe(0);
    });

    it("opérateur injoignable : la demande est prise, le montant réservé, et il part une seule fois ensuite", async () => {
      const { livreur, compte } = await t.creerLivreur();
      await avoir(livreur.id, 6000);
      t.operateur.enPanne = true;
      expect((await retirer(compte.jeton)).status).toBe(200);
      expect(await soldeDe(livreur.id)).toBe(0);
      expect(t.operateur.envoyes).toHaveLength(0);

      t.operateur.enPanne = false;
      expect(await t.versements.reprendre()).toBe(1);
      expect(await t.versements.reprendre()).toBe(0);
      expect(t.operateur.envoyes).toHaveLength(1);
    });

    it("opérateur qui refuse : 502 et le solde est intact", async () => {
      const { livreur, compte } = await t.creerLivreur();
      await avoir(livreur.id, 6000);
      t.operateur.refuse = true;
      const rep = await retirer(compte.jeton);
      expect(rep.status).toBe(502);
      expect(await soldeDe(livreur.id)).toBe(6000);
    });
  });

  describe("versement du soir", () => {
    async function livrer() {
      const { livreur, colis, missionId } = await livraisonEnCours();
      await t
        .http()
        .post(`/livreurs/moi/missions/${missionId}/remise`)
        .set(entete(livreur.compte.jeton))
        .send({ code: colis.code, pieceVerifiee: true, photoRef: "photos/r.jpg" })
        .expect(200);
      return livreur;
    }

    it("ne verse rien avant 20 h, puis verse le solde par MoMo une seule fois", async () => {
      const livreur = await livrer();
      t.horloge.regler(new Date("2026-11-02T18:59:00.000Z")); // 19 h 59 à Douala
      expect(await t.tachesLivraison.verserLesLivreurs()).toEqual({
        verses: 0,
        enAttente: 0,
        refuses: 0,
      });

      t.horloge.avancer(MINUTE);
      expect(await t.tachesLivraison.verserLesLivreurs()).toEqual({
        verses: 1,
        enAttente: 0,
        refuses: 0,
      });
      expect(t.operateur.envoyes).toHaveLength(1);
      expect(t.operateur.envoyes[0]).toMatchObject({ montant: 700, telephone: "+237670000222" });
      expect(await t.portefeuille.solde("livreur", livreur.livreur.id)).toBe(0);

      expect(await t.tachesLivraison.verserLesLivreurs()).toEqual({
        verses: 0,
        enAttente: 0,
        refuses: 0,
      });
      t.horloge.avancer(HEURE);
      expect(await t.tachesLivraison.verserLesLivreurs()).toEqual({
        verses: 0,
        enAttente: 0,
        refuses: 0,
      });
      expect(t.operateur.envoyes).toHaveLength(1);
    });

    it("le lendemain soir verse les nouveaux gains avec une autre clé ; deux passages simultanés ne paient qu'une fois", async () => {
      const livreur = await livrer();
      t.horloge.regler(new Date("2026-11-02T19:30:00.000Z"));
      await Promise.all([
        t.tachesLivraison.verserLesLivreurs(),
        t.tachesLivraison.verserLesLivreurs(),
      ]);
      expect(t.operateur.envoyes).toHaveLength(1);

      await t.portefeuille.crediter({
        cle: "mission:demain",
        type: "livreur",
        partenaireId: livreur.livreur.id,
        montant: 700,
        motif: "livraison",
        reference: "demain",
        at: "2026-11-03T12:00:00.000+01:00",
      });
      t.horloge.avancer(24 * HEURE);
      await t.tachesLivraison.verserLesLivreurs();
      expect(t.operateur.envoyes.map((v) => v.montant)).toEqual([700, 700]);
      expect(new Set(t.operateur.envoyes.map((v) => v.cle)).size).toBe(2);
    });

    it("opérateur injoignable : le montant reste réservé et la reprise le verse sans doublon", async () => {
      await livrer();
      t.horloge.regler(new Date("2026-11-02T19:30:00.000Z"));
      t.operateur.enPanne = true;
      expect(await t.tachesLivraison.verserLesLivreurs()).toEqual({
        verses: 0,
        enAttente: 1,
        refuses: 0,
      });
      t.operateur.enPanne = false;
      const bilan = await t.tachesLivraison.toutExecuter();
      expect(bilan.versementsRepris).toBe(1);
      expect(bilan.versements).toEqual({ verses: 0, enAttente: 0, refuses: 0 });
      expect(t.operateur.envoyes).toHaveLength(1);
    });
  });

  describe("inviter un livreur", () => {
    const inviter = (jeton: string, telephone: string) =>
      t.http().post("/livreurs/moi/invitations").set(entete(jeton)).send({ telephone });

    it("envoie un SMS, au plus cinq par jour", async () => {
      const { compte } = await t.creerLivreur({ nom: "Éric Tchoua" });
      for (let i = 0; i < 5; i++) {
        const telephone = `+23767700010${i}`;
        const rep = await inviter(compte.jeton, telephone);
        expect(rep.status, JSON.stringify(rep.body)).toBe(200);
        const vue = contrats.SchemaInvitationEnvoyee.parse(rep.body);
        expect(vue.envoyeA).not.toContain("7700010");
        expect(dernierSmsA(t, telephone)).toContain("Éric Tchoua");
      }
      const sixieme = await inviter(compte.jeton, "+237677000199");
      expect(sixieme.status).toBe(429);
      expect(dernierSmsA(t, "+237677000199")).toBeUndefined();

      t.horloge.avancer(24 * HEURE);
      expect((await inviter(compte.jeton, "+237677000199")).status).toBe(200);
    });

    it("refuse un numéro invalide, et ne compte pas une invitation dont le SMS n'est pas parti", async () => {
      const { compte } = await t.creerLivreur();
      expect((await inviter(compte.jeton, "677000100")).status).toBe(400);
      const envoyer = t.sms.envoyer.bind(t.sms);
      t.sms.envoyer = async () => {
        throw new Error("fournisseur SMS en panne");
      };
      expect((await inviter(compte.jeton, "+237677000100")).status).toBe(503);
      t.sms.envoyer = envoyer;
      expect(t.invitations.lignes).toHaveLength(0);
    });
  });
});
