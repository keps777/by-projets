import { colis as contrats } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  amenerJusquaDisponible,
  creerAppRelaisTest,
  creerColis,
  creerEquipeRelais,
  dernierSmsA,
  entete,
  fauxCode,
  GARE_BAF,
  tousLesSmsA,
  type AppRelaisTest,
  type ColisCree,
  type EquipeRelais,
} from "./testing/app-relais-test";

const JOUR = 24 * 3600_000;
const HEURE = 3600_000;

describe("points relais : choix, réception, remise, gains", () => {
  let t: AppRelaisTest;
  let e: EquipeRelais;

  beforeEach(async () => {
    t = await creerAppRelaisTest();
    e = await creerEquipeRelais(t);
  });
  afterEach(async () => {
    await t.fermer();
  });

  /** Un colis de l'expéditeur, choisi pour ce relais et arrivé à la gare de Bafoussam. */
  async function colisPourRelais(relaisId: string, over: Record<string, unknown> = {}) {
    const colis = await creerColis(t, e, over);
    const choix = await t
      .http()
      .put(`/colis/${colis.colisId}/relais`)
      .set(entete(e.expediteur.jeton))
      .send({ relaisId });
    expect(choix.status, JSON.stringify(choix.body)).toBe(200);
    await amenerJusquaDisponible(t, e, colis.colisId);
    return colis;
  }

  const recevoir = (jeton: string, numeroColis: string) =>
    t.http().post("/relais/moi/receptions").set(entete(jeton)).send({ numeroColis });

  const remettre = (jeton: string, colis: ColisCree, over: Record<string, unknown> = {}) =>
    t
      .http()
      .post("/relais/moi/remises")
      .set(entete(jeton))
      .send({
        colisId: colis.colisId,
        code: colis.code,
        pieceVerifiee: true,
        photoRef: "photos/remise-relais.jpg",
        ...over,
      });

  const soldeDe = (relaisId: string) => t.portefeuille.solde("relais", relaisId);

  describe("l'expéditeur choisit un point relais", () => {
    it("liste les relais de la ville du destinataire, du plus proche au plus loin, avec le contrat", async () => {
      const proche = await t.creerRelais({
        nom: "Chez Mama Ngo",
        position: { lat: 5.4737, lon: 10.4179 },
      });
      const loin = await t.creerRelais({
        nom: "Pharmacie du Centre",
        position: { lat: 5.5, lon: 10.5 },
      });
      await t.creerRelais({ nom: "Relais de Douala", ville: "Douala" });
      await t.creerRelais({ nom: "Relais fermé", actif: false });
      const colis = await creerColis(t, e);
      // Les coordonnées de la gare servent de point de départ des distances.
      t.lieux.gares.set(GARE_BAF.id, { lat: 5.4745, lon: 10.4185 });

      const rep = await t
        .http()
        .get(`/colis/${colis.colisId}/relais`)
        .set(entete(e.expediteur.jeton));
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaRelaisProches.parse(rep.body);
      expect(vue.relais.map((r) => r.nom)).toEqual(["Chez Mama Ngo", "Pharmacie du Centre"]);
      expect(vue.relais[0]?.rang).toBe(1);
      expect(vue.relais[0]?.distanceM).toBeLessThan(vue.relais[1]?.distanceM ?? 0);
      expect(vue.relais[0]?.supplement).toBe(300);
      expect(vue.devenir.partParColis).toBe(200);
      expect(proche.relais.id).toBe(vue.relais[0]?.id);
      expect(loin.relais.id).toBe(vue.relais[1]?.id);
    });

    it("n'est ouvert à personne d'autre que l'expéditeur du colis", async () => {
      await t.creerRelais();
      const colis = await creerColis(t, e);
      for (const jeton of [e.destinataire.jeton, e.inconnu.jeton]) {
        const rep = await t.http().get(`/colis/${colis.colisId}/relais`).set(entete(jeton));
        expect(rep.status).toBe(404);
      }
    });

    it("choisit le relais : supplément de 300 F, destinataire prévenu, mode « relais » enregistré", async () => {
      const { relais } = await t.creerRelais();
      const colis = await creerColis(t, e);

      const rep = await t
        .http()
        .put(`/colis/${colis.colisId}/relais`)
        .set(entete(e.expediteur.jeton))
        .send({ relaisId: relais.id });
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(contrats.SchemaRelaisChoisi.parse(rep.body)).toMatchObject({
        relais: { id: relais.id, nom: relais.nom },
        supplement: 300,
        destinatairePrevenu: true,
      });
      const stocke = await t.repo.trouver(colis.colisId);
      expect(stocke).toMatchObject({ mode: "relais", relaisId: relais.id });
      expect(dernierSmsA(t, e.destinataire.telephone)).toContain(relais.nom);
    });

    it("refuse un relais d'une autre ville, inactif, inconnu ou trop petit pour le colis", async () => {
      const autreVille = await t.creerRelais({ ville: "Douala" });
      const inactif = await t.creerRelais({ actif: false });
      const petit = await t.creerRelais({ tailleMax: "Petits colis (≤ 1 kg)" });
      const colis = await creerColis(t, e, { poidsKg: 2 });
      const choisir = (relaisId: string) =>
        t
          .http()
          .put(`/colis/${colis.colisId}/relais`)
          .set(entete(e.expediteur.jeton))
          .send({ relaisId });

      expect((await choisir(autreVille.relais.id)).body.code).toBe("relais_hors_ville");
      expect((await choisir(inactif.relais.id)).status).toBe(404);
      expect((await choisir("00000000-0000-4000-8000-00000000dead")).status).toBe(404);
      const trop = await choisir(petit.relais.id);
      expect(trop.status).toBe(422);
      expect(trop.body.code).toBe("colis_trop_lourd");
      expect((await t.repo.trouver(colis.colisId))?.mode).toBe("gare");
    });

    it("refuse un relais complet : la capacité compte les colis gardés et attendus", async () => {
      const { relais } = await t.creerRelais({ capacite: 1 });
      await colisPourRelais(relais.id);
      const second = await creerColis(t, e);
      const rep = await t
        .http()
        .put(`/colis/${second.colisId}/relais`)
        .set(entete(e.expediteur.jeton))
        .send({ relaisId: relais.id });
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("relais_complet");
    });
  });

  describe("réception d'un colis", () => {
    it("le relais scanne l'étiquette : le colis passe « en relais » et la destinataire est prévenue", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await colisPourRelais(relais.id);

      const rep = await recevoir(compte.jeton, colis.numero);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaColisRecuRelais.parse(rep.body);
      expect(vue.colis.etat).toBe("en_relais");
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_relais");
      expect(dernierSmsA(t, e.destinataire.telephone)).toContain(relais.nom);
      expect((await t.relaisRepo.trouver(relais.id))?.premierColisA).not.toBeNull();
      // Rejouer le scan ne casse rien et garde la même heure de réception.
      const encore = await recevoir(compte.jeton, colis.numero);
      expect(encore.status).toBe(200);
      expect(encore.body.recuLe).toBe(rep.body.recuLe);
    });

    it("refuse un colis destiné à un autre relais, sans rien changer", async () => {
      const a = await t.creerRelais({ nom: "Relais A" });
      const b = await t.creerRelais({ nom: "Relais B" });
      const colis = await colisPourRelais(a.relais.id);

      const rep = await recevoir(b.compte.jeton, colis.numero);
      expect(rep.status).toBe(403);
      expect(rep.body.code).toBe("autre_relais");
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("disponible");
      const lecture = await t
        .http()
        .get(`/relais/moi/colis/${colis.colisId}`)
        .set(entete(b.compte.jeton));
      expect(lecture.status).toBe(403);
    });

    it("refuse un colis qui n'est pas encore arrivé à la gare", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await creerColis(t, e);
      await t
        .http()
        .put(`/colis/${colis.colisId}/relais`)
        .set(entete(e.expediteur.jeton))
        .send({ relaisId: relais.id });
      const rep = await recevoir(compte.jeton, colis.numero);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("etat_incompatible");
    });

    it("refuse de recevoir au-delà de la capacité du relais", async () => {
      const { relais, compte } = await t.creerRelais({ capacite: 2 });
      const un = await colisPourRelais(relais.id);
      const deux = await colisPourRelais(relais.id);
      expect((await recevoir(compte.jeton, un.numero)).status).toBe(200);
      // Le relais réduit sa capacité entre le choix et l'arrivée du second colis.
      const actuel = (await t.relaisRepo.trouver(relais.id))!;
      await t.relaisRepo.remplacer({ ...actuel, capacite: 1 }, actuel.version);
      const rep = await recevoir(compte.jeton, deux.numero);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("capacite_atteinte");
      expect((await t.repo.trouver(deux.colisId))?.etat).toBe("disponible");
    });
  });

  describe("remise : jamais sans le bon code", () => {
    it("un code faux est refusé (essais restants), le colis ne bouge pas et le relais ne gagne rien", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, colis.numero);

      const rep = await remettre(compte.jeton, colis, { code: fauxCode(colis.code) });
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("code_invalide");
      expect(JSON.stringify(rep.body)).toContain("2");
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_relais");
      expect(await soldeDe(relais.id)).toBe(0);
    });

    it("trois codes faux bloquent le colis (423) : même le bon code ne passe plus, aucun gain", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, colis.numero);
      const faux = fauxCode(colis.code);

      expect((await remettre(compte.jeton, colis, { code: faux })).status).toBe(422);
      expect((await remettre(compte.jeton, colis, { code: faux })).status).toBe(422);
      expect((await remettre(compte.jeton, colis, { code: faux })).status).toBe(423);
      const bon = await remettre(compte.jeton, colis);
      expect(bon.status).toBe(423);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_relais");
      expect(await soldeDe(relais.id)).toBe(0);
      expect(t.portefeuille.creditsLignes.size).toBe(0);

      // Un superviseur débloque : la remise passe alors, une seule fois.
      const debloque = await t
        .http()
        .post(`/agence/colis/${colis.colisId}/deblocage`)
        .set(entete(e.superviseur.jeton));
      expect(debloque.status).toBe(204);
      expect((await remettre(compte.jeton, colis)).status).toBe(200);
    });

    it("exige la pièce vue et la photo : sans elles, 400 et rien ne change", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, colis.numero);

      for (const over of [
        { pieceVerifiee: false },
        { pieceVerifiee: undefined },
        { photoRef: "" },
        { photoRef: undefined },
        { code: "12" },
        { code: undefined },
      ]) {
        const rep = await remettre(compte.jeton, colis, over);
        expect(rep.status, JSON.stringify(over)).toBe(400);
      }
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_relais");
      expect(await soldeDe(relais.id)).toBe(0);
    });

    it("avec le bon code : le colis est remis, 200 F crédités une seule fois, réponse conforme au contrat", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, colis.numero);

      const rep = await remettre(compte.jeton, colis);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaColisRemisRelais.parse(rep.body);
      expect(vue).toMatchObject({ gain: 200, colis: { etat: "remis" } });
      expect(contrats.fuitesCodeRetrait(rep.body, [colis.code])).toEqual([]);
      expect(await soldeDe(relais.id)).toBe(200);

      // Rejouer la remise : le colis est déjà remis, le gain n'est pas doublé.
      const encore = await remettre(compte.jeton, colis);
      expect(encore.status).toBe(409);
      expect(await soldeDe(relais.id)).toBe(200);
      expect([...t.portefeuille.creditsLignes.keys()]).toEqual([`remise:${colis.colisId}`]);
    });

    it("un autre relais ne peut pas remettre ce colis, même avec le bon code", async () => {
      const a = await t.creerRelais({ nom: "Relais A" });
      const b = await t.creerRelais({ nom: "Relais B" });
      const colis = await colisPourRelais(a.relais.id);
      await recevoir(a.compte.jeton, colis.numero);

      const rep = await remettre(b.compte.jeton, colis);
      expect(rep.status).toBe(403);
      expect(rep.body.code).toBe("autre_relais");
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_relais");
      expect(await soldeDe(b.relais.id)).toBe(0);
    });

    it("n'est réservée qu'au rôle relais", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, colis.numero);
      for (const jeton of [e.expediteur.jeton, e.guichetierBaf.jeton, e.agent.jeton]) {
        expect((await remettre(jeton, colis)).status).toBe(403);
      }
      const sansJeton = await t.http().post("/relais/moi/remises").send({});
      expect(sansJeton.status).toBe(401);
    });
  });

  describe("l'espace du relais", () => {
    it("montre les colis en garde, les gains de la semaine, sans jamais le code", async () => {
      const { relais, compte } = await t.creerRelais();
      const un = await colisPourRelais(relais.id);
      const deux = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, un.numero);
      await recevoir(compte.jeton, deux.numero);
      await remettre(compte.jeton, un);
      // Le deuxième colis est scanné pour une remise : elle apparaît « en cours ».
      await t.http().get(`/relais/moi/colis/${deux.numero}`).set(entete(compte.jeton));

      const rep = await t.http().get("/relais/moi").set(entete(compte.jeton));
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaEspaceRelais.parse(rep.body);
      expect(vue.resume).toMatchObject({
        enGarde: 1,
        capacite: 30,
        semaine: { gain: 200, remis: 1, versement: { jour: "lundi" } },
      });
      expect(vue.enGarde).toHaveLength(1);
      expect(vue.enGarde[0]).toMatchObject({
        depuisJours: 0,
        joursRestants: 7,
        rappelEnvoye: false,
      });
      expect(vue.remiseEnCours?.colis.numero).toBe(deux.numero);
      expect(vue.gainParRemise).toBe(200);
      expect(vue.gardeJours).toBe(7);
      expect(contrats.fuitesCodeRetrait(rep.body, [un.code, deux.code])).toEqual([]);
    });

    it("refuse un relais suspendu", async () => {
      const { relais, compte } = await t.creerRelais();
      await t.relaisRepo.remplacer({ ...relais, actif: false }, relais.version);
      const rep = await t.http().get("/relais/moi").set(entete(compte.jeton));
      expect(rep.status).toBe(403);
      expect(rep.body.code).toBe("relais_suspendu");
    });
  });

  describe("garde de 7 jours, rappel et reprise", () => {
    it("rappelle une seule fois dès le 5e jour, marque « non retiré » au 7e, paie 100 F à la reprise", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, colis.numero);

      t.horloge.avancer(4 * JOUR);
      expect(await t.taches.envoyerRappels()).toBe(0);
      expect(await t.taches.marquerNonRetires()).toBe(0);

      t.horloge.avancer(JOUR);
      expect(await t.taches.envoyerRappels()).toBe(1);
      expect(await t.taches.envoyerRappels()).toBe(0);
      expect(
        tousLesSmsA(t, e.destinataire.telephone).filter((m) => m.includes("vous attend chez")),
      ).toHaveLength(1);
      expect(dernierSmsA(t, e.destinataire.telephone)).toContain("dans 2 jours");
      const espace = await t.http().get("/relais/moi").set(entete(compte.jeton));
      expect(espace.body.enGarde[0]).toMatchObject({
        depuisJours: 5,
        joursRestants: 2,
        rappelEnvoye: true,
      });

      // Le colis a encore deux jours de garde : rien n'est marqué.
      t.horloge.avancer(JOUR);
      expect(await t.taches.marquerNonRetires()).toBe(0);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_relais");
    });

    it("à 7 jours le colis passe « non retiré » ; une fois repris par l'agence, le relais touche 100 F (une fois)", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, colis.numero);

      t.horloge.avancer(6 * JOUR + 23 * HEURE);
      expect(await t.taches.marquerNonRetires()).toBe(0);
      t.horloge.avancer(HEURE);
      expect(await t.taches.marquerNonRetires()).toBe(1);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("non_retire");
      // Plus de rappel pour un colis déjà marqué.
      expect(await t.taches.envoyerRappels()).toBe(0);

      expect(await t.taches.crediterReprises()).toBe(0);
      const retour = await t
        .http()
        .post("/agence/colis/scans")
        .set(entete(e.guichetierBaf.jeton))
        .send({ colisId: colis.colisId, action: "retourner" });
      expect(retour.status, JSON.stringify(retour.body)).toBe(200);

      expect(await t.taches.crediterReprises()).toBe(1);
      expect(await t.taches.crediterReprises()).toBe(0);
      expect(await soldeDe(relais.id)).toBe(100);
      expect([...t.portefeuille.creditsLignes.keys()]).toEqual([`reprise:${colis.colisId}`]);
    });

    it("un colis remis à temps ne rapporte pas de reprise et n'est jamais marqué", async () => {
      const { relais, compte } = await t.creerRelais();
      const colis = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, colis.numero);
      t.horloge.avancer(3 * JOUR);
      expect((await remettre(compte.jeton, colis)).status).toBe(200);
      t.horloge.avancer(10 * JOUR);
      expect(await t.taches.marquerNonRetires()).toBe(0);
      expect(await t.taches.crediterReprises()).toBe(0);
      expect(await soldeDe(relais.id)).toBe(200);
    });
  });

  describe("versement du lundi", () => {
    async function deuxRemises(jeton: string, relaisId: string) {
      for (let i = 0; i < 2; i++) {
        const colis = await colisPourRelais(relaisId);
        await recevoir(jeton, colis.numero);
        expect((await remettre(jeton, colis)).status).toBe(200);
      }
    }

    it("ne verse pas avant lundi 8 h, puis verse tout le solde par MoMo, une seule fois", async () => {
      const { relais, compte } = await t.creerRelais();
      // Lundi 2 novembre 2026, 07 h à Douala.
      t.horloge.regler(new Date("2026-11-02T06:00:00.000Z"));
      await deuxRemises(compte.jeton, relais.id);
      expect(await soldeDe(relais.id)).toBe(400);

      expect(await t.taches.verserLesRelais()).toEqual({ verses: 0, enAttente: 0, refuses: 0 });
      expect(t.operateur.envoyes).toHaveLength(0);

      t.horloge.avancer(HEURE);
      expect(await t.taches.verserLesRelais()).toEqual({ verses: 1, enAttente: 0, refuses: 0 });
      expect(t.operateur.envoyes).toHaveLength(1);
      expect(t.operateur.envoyes[0]).toMatchObject({
        montant: 400,
        telephone: "+237670000111",
        operateur: "mtn",
      });
      expect(await soldeDe(relais.id)).toBe(0);

      expect(await t.taches.verserLesRelais()).toEqual({ verses: 0, enAttente: 0, refuses: 0 });
      expect(t.operateur.envoyes).toHaveLength(1);
    });

    it("la semaine suivante verse les nouveaux gains, avec une autre clé", async () => {
      const { relais, compte } = await t.creerRelais();
      await deuxRemises(compte.jeton, relais.id);
      await t.taches.verserLesRelais();
      t.horloge.avancer(7 * JOUR);
      const colis = await colisPourRelais(relais.id);
      await recevoir(compte.jeton, colis.numero);
      await remettre(compte.jeton, colis);
      await t.taches.verserLesRelais();
      expect(t.operateur.envoyes.map((v) => v.montant)).toEqual([400, 200]);
      expect(new Set(t.operateur.envoyes.map((v) => v.cle)).size).toBe(2);
    });

    it("opérateur injoignable : le montant reste réservé, la reprise le verse une fois, sans doublon", async () => {
      const { relais, compte } = await t.creerRelais();
      await deuxRemises(compte.jeton, relais.id);
      t.operateur.enPanne = true;

      expect(await t.taches.verserLesRelais()).toEqual({ verses: 0, enAttente: 1, refuses: 0 });
      expect(await soldeDe(relais.id)).toBe(0); // réservé : pas dépensable une seconde fois
      expect(await t.taches.verserLesRelais()).toEqual({ verses: 0, enAttente: 0, refuses: 0 });

      t.operateur.enPanne = false;
      expect(await t.versements.reprendre()).toBe(1);
      expect(await t.versements.reprendre()).toBe(0);
      expect(t.operateur.envoyes).toHaveLength(1);
      expect(t.operateur.envoyes[0]?.montant).toBe(400);
    });

    it("opérateur qui refuse pour de bon : le solde revient et sera retenté la semaine suivante", async () => {
      const { relais, compte } = await t.creerRelais();
      await deuxRemises(compte.jeton, relais.id);
      t.operateur.refuse = true;
      expect(await t.taches.verserLesRelais()).toEqual({ verses: 0, enAttente: 0, refuses: 1 });
      expect(await soldeDe(relais.id)).toBe(400);
      expect(t.operateur.envoyes).toHaveLength(0);

      t.operateur.refuse = false;
      t.horloge.avancer(7 * JOUR);
      expect(await t.taches.verserLesRelais()).toEqual({ verses: 1, enAttente: 0, refuses: 0 });
      expect(t.operateur.envoyes[0]?.montant).toBe(400);
    });

    it("deux passages simultanés ne versent qu'une fois", async () => {
      const { relais, compte } = await t.creerRelais();
      await deuxRemises(compte.jeton, relais.id);
      await Promise.all([t.taches.verserLesRelais(), t.taches.verserLesRelais()]);
      expect(t.operateur.envoyes).toHaveLength(1);
      expect(await soldeDe(relais.id)).toBe(0);
    });
  });
});
