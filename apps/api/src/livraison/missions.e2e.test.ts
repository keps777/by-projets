import { colis as contrats } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  amenerJusquaDisponible,
  creerAppLivraisonTest,
  creerColis,
  creerEquipeRelais,
  dernierSmsA,
  entete,
  fauxCode,
  type AppLivraisonTest,
  type ColisCree,
  type EquipeRelais,
} from "./testing/app-livraison-test";

const SECONDE = 1000;
const MINUTE = 60 * SECONDE;

describe("livraison moto : missions, acceptation en 30 s, remise contre code", () => {
  let t: AppLivraisonTest;
  let e: EquipeRelais;

  beforeEach(async () => {
    t = await creerAppLivraisonTest();
    e = await creerEquipeRelais(t);
  });
  afterEach(async () => {
    await t.fermer();
  });

  /** Un colis payé en livraison moto, arrivé à la gare de Bafoussam. */
  async function colisMoto(over: Record<string, unknown> = {}): Promise<ColisCree> {
    const colis = await creerColis(t, e, {
      mode: "moto",
      adresseLivraison: "Tamdja, Bafoussam",
      ...over,
    });
    await amenerJusquaDisponible(t, e, colis.colisId);
    return colis;
  }

  const espace = (jeton: string) => t.http().get("/livreurs/moi").set(entete(jeton));
  const accepter = (jeton: string, missionId: string) =>
    t.http().post(`/livreurs/moi/missions/${missionId}/acceptation`).set(entete(jeton));
  const passer = (jeton: string, missionId: string) =>
    t.http().post(`/livreurs/moi/missions/${missionId}/refus`).set(entete(jeton));
  const absence = (jeton: string, missionId: string) =>
    t.http().post(`/livreurs/moi/missions/${missionId}/absence`).set(entete(jeton));
  const remettre = (
    jeton: string,
    missionId: string,
    colis: ColisCree,
    over: Record<string, unknown> = {},
  ) =>
    t
      .http()
      .post(`/livreurs/moi/missions/${missionId}/remise`)
      .set(entete(jeton))
      .send({ code: colis.code, pieceVerifiee: true, photoRef: "photos/remise-moto.jpg", ...over });

  /** L'identifiant de la mission actuellement proposée à ce livreur, ou `null`. */
  async function propositionDe(jeton: string): Promise<string | null> {
    const rep = await espace(jeton);
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    return (rep.body.mission?.id as string | undefined) ?? null;
  }

  const gainDe = (livreurId: string) => t.portefeuille.solde("livreur", livreurId);

  describe("à qui la mission est proposée", () => {
    it("seulement au livreur qui sert la zone, travaille à cette heure, porte le poids, est en ligne et en règle", async () => {
      await colisMoto({ poidsKg: 2 });
      const bon = await t.creerLivreur({ nom: "Éric Tchoua" });
      const autreVille = await t.creerLivreur({ zone: "Douala · Akwa, Bonanjo", ville: "Douala" });
      const autreQuartier = await t.creerLivreur({ zone: "Bafoussam · Djeleng, centre" });
      const soir = await t.creerLivreur({ heures: "Soirs 17 h – 21 h" });
      const leger = await t.creerLivreur({ chargeMax: "1 kg · petits colis" });
      const horsLigne = await t.creerLivreur({ disponible: false });
      const suspendu = await t.creerLivreur({ actif: false });
      const permisPerime = await t.creerLivreur({
        pieces: {
          permisRef: "p",
          assuranceRef: "a",
          permisValideJusqua: "2026-10-31",
          assuranceExpireLe: "2027-12-31",
        },
      });
      const aVelo = await t.creerLivreur({ deplacement: "velo", moto: null });

      await t.missions.ouvrirMissions();

      const id = await propositionDe(bon.compte.jeton);
      expect(id).not.toBeNull();
      const exclus = [autreVille, autreQuartier, soir, leger, horsLigne, permisPerime];
      for (const v of [...exclus, aVelo]) {
        expect(await propositionDe(v.compte.jeton), v.livreur.badge).toBeNull();
      }
      const missions = [...t.missionsRepo.lignes.values()];
      expect(missions).toHaveLength(1);
      expect(missions[0]).toMatchObject({ etat: "proposee", livreurId: bon.livreur.id, gain: 700 });

      // Quand le premier passe, elle va au vélo (sans permis à présenter), jamais aux autres.
      await passer(bon.compte.jeton, id!);
      expect(await propositionDe(aVelo.compte.jeton)).toBe(id);
      for (const v of exclus)
        expect(await propositionDe(v.compte.jeton), v.livreur.badge).toBeNull();
      // Un livreur suspendu ne reçoit rien et ne peut même plus ouvrir son espace.
      expect((await espace(suspendu.compte.jeton)).status).toBe(403);
      expect(
        [...t.missionsRepo.lignes.values()].flatMap((m) => m.essais.map((x) => x.livreurId)),
      ).not.toContain(suspendu.livreur.id);
    });

    it("cherche le quartier du destinataire dans la zone du livreur", async () => {
      await colisMoto({ adresseLivraison: "Quartier Djeleng, Bafoussam" });
      const tamdja = await t.creerLivreur({ zone: "Bafoussam · Tamdja, Biyem" });
      const djeleng = await t.creerLivreur({ zone: "Bafoussam · Tamdja, Djeleng, centre" });
      await t.missions.ouvrirMissions();
      expect(await propositionDe(tamdja.compte.jeton)).toBeNull();
      expect(await propositionDe(djeleng.compte.jeton)).not.toBeNull();
    });

    it("donne la course à celui qui a le moins livré aujourd'hui, puis à la meilleure note", async () => {
      const ancien = await t.creerLivreur({ numero: 1, note: 4.5 });
      const noteMax = await t.creerLivreur({ numero: 2, note: 5 });
      const repose = await t.creerLivreur({ numero: 3, note: 5 });
      // « ancien » a déjà fait une livraison aujourd'hui.
      await t.missionsRepo.ajouter({
        id: "00000000-0000-4000-8000-0000000000b1",
        version: 1,
        colisId: "00000000-0000-4000-8000-0000000000b2",
        colisNumero: "C-X-1",
        etat: "livree",
        livreurId: ancien.livreur.id,
        proposeeA: null,
        expireA: null,
        essais: [],
        tour: 0,
        prochaineA: null,
        creeA: "2026-11-02T08:00:00.000+01:00",
        accepteeA: null,
        livreeA: "2026-11-02T08:30:00.000+01:00",
        trajet: { depart: "x", arrivee: "y", destinataire: "z" },
        distanceM: 1,
        dureeMinutes: 1,
        prixLivraison: 1000,
        gain: 700,
        absence: null,
        repliA: null,
      });
      await colisMoto();
      await t.missions.ouvrirMissions();
      // noteMax et repose ont 0 livraison ; à égalité, la meilleure note puis le plus ancien badge.
      expect(await propositionDe(noteMax.compte.jeton)).not.toBeNull();
      expect(await propositionDe(repose.compte.jeton)).toBeNull();
      expect(await propositionDe(ancien.compte.jeton)).toBeNull();
    });

    it("un livreur déjà sur une mission n'en reçoit pas une seconde", async () => {
      const a = await t.creerLivreur({ numero: 1 });
      const b = await t.creerLivreur({ numero: 2 });
      await colisMoto();
      await colisMoto();
      await t.missions.ouvrirMissions();
      expect(await propositionDe(a.compte.jeton)).not.toBeNull();
      expect(await propositionDe(b.compte.jeton)).not.toBeNull();
      const missions = [...t.missionsRepo.lignes.values()];
      expect(new Set(missions.map((m) => m.livreurId)).size).toBe(2);
    });

    it("ouvre la mission une seule fois par colis, même si la tâche tourne deux fois", async () => {
      await t.creerLivreur();
      await colisMoto();
      await Promise.all([t.missions.ouvrirMissions(), t.missions.ouvrirMissions()]);
      await t.missions.ouvrirMissions();
      expect(t.missionsRepo.lignes.size).toBe(1);
    });

    it("n'ouvre pas de mission pour un colis non payé ni pour un colis en mode gare", async () => {
      await t.creerLivreur();
      t.paiements.enAttente = true;
      await colisMoto();
      t.paiements.enAttente = false;
      await colisMoto({ mode: "gare", adresseLivraison: undefined });
      await t.missions.ouvrirMissions();
      expect(t.missionsRepo.lignes.size).toBe(0);
    });

    it("la mission montrée au livreur est conforme au contrat et ne contient jamais le code", async () => {
      const colis = await colisMoto();
      const { compte } = await t.creerLivreur({ nom: "Éric Tchoua" });
      await t.missions.ouvrirMissions();

      const rep = await espace(compte.jeton);
      const vue = contrats.SchemaEspaceLivreur.parse(rep.body);
      expect(vue.mission).toMatchObject({
        gain: 700,
        delaiAcceptationSecondes: 30,
        remiseContreCode: true,
        trajet: { arrivee: "Tamdja, Bafoussam", destinataire: "Ngo Thérèse" },
        colis: { numero: colis.numero, codeRequis: true },
      });
      expect(vue.livreur).toMatchObject({ initiales: "ÉT", disponible: true, numero: 1 });
      expect(vue.retrait).toEqual({ solde: 0, seuil: 5000 });
      expect(vue.regles.texte).toContain("Jamais de remise sans code");
      expect(contrats.fuitesCodeRetrait(rep.body, [colis.code])).toEqual([]);
      expect(JSON.stringify(rep.body)).not.toContain(colis.code);
    });
  });

  describe("30 secondes pour accepter", () => {
    async function troisLivreurs() {
      const a = await t.creerLivreur({ numero: 1 });
      const b = await t.creerLivreur({ numero: 2 });
      const c = await t.creerLivreur({ numero: 3 });
      return { a, b, c };
    }

    it("accepte à 29 s : le colis part « en livraison » et personne d'autre ne reçoit la mission", async () => {
      const { a, b } = await troisLivreurs();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(a.compte.jeton))!;

      t.horloge.avancer(29 * SECONDE);
      const rep = await accepter(a.compte.jeton, id);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaMissionAcceptee.parse(rep.body);
      expect(vue).toMatchObject({ missionId: id, acceptee: true, colis: { etat: "en_livraison" } });
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_livraison");
      expect(await propositionDe(b.compte.jeton)).toBeNull();
      // L'acceptation rejouée donne la même réponse sans refaire le travail.
      const encore = await accepter(a.compte.jeton, id);
      expect(encore.status).toBe(200);
      expect(encore.body.accepteeLe).toBe(rep.body.accepteeLe);
      const historique = (await t.repo.trouver(colis.colisId))!.historique;
      expect(historique.filter((h) => h.action === "mettre_en_livraison")).toHaveLength(1);
    });

    it("accepte à 29,999 s mais plus à 30 s : 410, et la mission passe au livreur suivant", async () => {
      const { a, b } = await troisLivreurs();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(a.compte.jeton))!;

      t.horloge.avancer(30 * SECONDE);
      const rep = await accepter(a.compte.jeton, id);
      expect(rep.status).toBe(410);
      expect(rep.body.code).toBe("mission_expiree");
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("disponible");

      // La même mission est maintenant proposée à b, avec ses propres 30 secondes.
      expect(await propositionDe(b.compte.jeton)).toBe(id);
      expect(await propositionDe(a.compte.jeton)).toBeNull();
      expect((await accepter(a.compte.jeton, id)).status).toBe(410);
      t.horloge.avancer(29 * SECONDE);
      expect((await accepter(b.compte.jeton, id)).status).toBe(200);
      expect(t.missionsRepo.lignes.get(id)).toMatchObject({
        etat: "acceptee",
        livreurId: b.livreur.id,
      });
    });

    it("sans aucun appel du livreur, la tâche de fond fait passer la mission au suivant à 30 s", async () => {
      const { a, b, c } = await troisLivreurs();
      await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(a.compte.jeton))!;

      t.horloge.avancer(29 * SECONDE);
      expect((await t.missions.avancer()).propositionsPassees).toBe(0);
      expect(await propositionDe(a.compte.jeton)).toBe(id);

      t.horloge.avancer(SECONDE);
      expect((await t.missions.avancer()).propositionsPassees).toBe(1);
      expect(await propositionDe(b.compte.jeton)).toBe(id);
      expect(await propositionDe(c.compte.jeton)).toBeNull();

      t.horloge.avancer(30 * SECONDE);
      await t.missions.avancer();
      expect(await propositionDe(c.compte.jeton)).toBe(id);
      const essais = t.missionsRepo.lignes.get(id)!.essais;
      expect(essais.map((x) => [x.livreurId, x.issue])).toEqual([
        [a.livreur.id, "expiree"],
        [b.livreur.id, "expiree"],
      ]);
    });

    it("l'expiration et l'acceptation tardive qui se croisent ne font passer la mission qu'une fois", async () => {
      const { a, b, c } = await troisLivreurs();
      await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(a.compte.jeton))!;
      t.horloge.avancer(30 * SECONDE);

      const [rep] = await Promise.all([
        accepter(a.compte.jeton, id),
        t.missions.avancer(),
        t.missions.avancer(),
      ]);
      expect(rep.status).toBe(410);
      const mission = t.missionsRepo.lignes.get(id)!;
      expect(mission).toMatchObject({ etat: "proposee", livreurId: b.livreur.id });
      expect(mission.essais).toHaveLength(1);
      expect(await propositionDe(c.compte.jeton)).toBeNull();
    });

    it("deux acceptations simultanées du même livreur ne mettent le colis en livraison qu'une fois", async () => {
      const { a } = await troisLivreurs();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(a.compte.jeton))!;

      const reponses = await Promise.all([
        accepter(a.compte.jeton, id),
        accepter(a.compte.jeton, id),
      ]);
      expect(reponses.map((r) => r.status)).toEqual([200, 200]);
      const historique = (await t.repo.trouver(colis.colisId))!.historique;
      expect(historique.filter((h) => h.action === "mettre_en_livraison")).toHaveLength(1);
    });

    it("un autre livreur ne peut ni accepter ni refuser la mission d'un collègue", async () => {
      const { a, b } = await troisLivreurs();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(a.compte.jeton))!;

      expect((await accepter(b.compte.jeton, id)).status).toBe(404);
      expect((await passer(b.compte.jeton, id)).status).toBe(404);
      expect((await accepter(b.compte.jeton, "pas-un-uuid")).status).toBe(404);
      expect(t.missionsRepo.lignes.get(id)).toMatchObject({
        etat: "proposee",
        livreurId: a.livreur.id,
      });
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("disponible");
    });

    it("refuser envoie tout de suite la mission au suivant ; après trois tours sans preneur, elle est abandonnée et le client prévenu", async () => {
      const a = await t.creerLivreur({ numero: 1 });
      const b = await t.creerLivreur({ numero: 2 });
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(a.compte.jeton))!;

      const refus = await passer(a.compte.jeton, id);
      expect(refus.status).toBe(200);
      contrats.SchemaMissionPassee.parse(refus.body);
      expect(await propositionDe(b.compte.jeton)).toBe(id);
      // Refuser deux fois ne fait pas passer deux livreurs.
      expect((await passer(a.compte.jeton, id)).status).toBe(200);
      expect(await propositionDe(b.compte.jeton)).toBe(id);

      await passer(b.compte.jeton, id);
      // Tour terminé : pause de deux minutes avant de recommencer.
      expect(t.missionsRepo.lignes.get(id)).toMatchObject({ etat: "en_attente", tour: 1 });
      await t.missions.avancer();
      expect(await propositionDe(a.compte.jeton)).toBeNull();
      t.horloge.avancer(2 * MINUTE);
      await t.missions.avancer();
      expect(await propositionDe(a.compte.jeton)).toBe(id);

      await passer(a.compte.jeton, id);
      await passer(b.compte.jeton, id);
      t.horloge.avancer(2 * MINUTE);
      await t.missions.avancer();
      await passer(a.compte.jeton, id);
      await passer(b.compte.jeton, id);

      expect(t.missionsRepo.lignes.get(id)?.etat).toBe("sans_livreur");
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("disponible");
      expect(dernierSmsA(t, e.destinataire.telephone)).toContain("aucun livreur");
      expect(
        t.auditRepo.lignes.some(
          (l) => l.action === "livraison.sans_livreur" && l.cibleId === colis.colisId,
        ),
      ).toBe(true);
      expect(await propositionDe(a.compte.jeton)).toBeNull();
    });

    it("sans livreur qui convienne, la mission attend une heure, puis est abandonnée et le client prévenu", async () => {
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = [...t.missionsRepo.lignes.keys()][0]!;
      expect(t.missionsRepo.lignes.get(id)?.etat).toBe("en_attente");

      for (let i = 0; i < 25; i++) {
        t.horloge.avancer(2 * MINUTE);
        await t.missions.avancer();
      }
      expect(t.missionsRepo.lignes.get(id)?.etat).toBe("en_attente"); // 50 minutes
      for (let i = 0; i < 6; i++) {
        t.horloge.avancer(2 * MINUTE);
        await t.missions.avancer();
      }
      expect(t.missionsRepo.lignes.get(id)?.etat).toBe("sans_livreur"); // 62 minutes
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("disponible");
      expect(dernierSmsA(t, e.destinataire.telephone)).toContain("aucun livreur");
    });

    it("un livreur qui se met en ligne plus tard reçoit la mission qui attendait", async () => {
      await colisMoto();
      await t.missions.ouvrirMissions();
      const id = [...t.missionsRepo.lignes.keys()][0]!;
      t.horloge.avancer(20 * MINUTE);
      const tard = await t.creerLivreur();
      await t.missions.avancer();
      expect(await propositionDe(tard.compte.jeton)).toBe(id);
    });

    it("annule la mission quand l'expéditeur change de mode avant l'acceptation", async () => {
      const { a } = await troisLivreurs();
      const { relais } = await t.creerRelais();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(a.compte.jeton))!;

      const choix = await t
        .http()
        .put(`/colis/${colis.colisId}/relais`)
        .set(entete(e.expediteur.jeton))
        .send({ relaisId: relais.id });
      expect(choix.status, JSON.stringify(choix.body)).toBe(200);

      const rep = await accepter(a.compte.jeton, id);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("mission_annulee");
      expect(t.missionsRepo.lignes.get(id)?.etat).toBe("annulee");
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("disponible");
      await t.missions.avancer();
      expect(await propositionDe(a.compte.jeton)).toBeNull();
    });
  });

  describe("remise contre le code du client", () => {
    async function missionAcceptee() {
      const livreur = await t.creerLivreur();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(livreur.compte.jeton))!;
      expect((await accepter(livreur.compte.jeton, id)).status).toBe(200);
      return { livreur, colis, id };
    }

    it("refuse la remise d'une mission qui n'est pas acceptée", async () => {
      const livreur = await t.creerLivreur();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(livreur.compte.jeton))!;
      const rep = await remettre(livreur.compte.jeton, id, colis);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("mission_non_acceptee");
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("disponible");
    });

    it("un code faux est refusé : le colis reste en livraison, le livreur ne gagne rien", async () => {
      const { livreur, colis, id } = await missionAcceptee();
      const rep = await remettre(livreur.compte.jeton, id, colis, { code: fauxCode(colis.code) });
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("code_invalide");
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_livraison");
      expect(t.missionsRepo.lignes.get(id)?.etat).toBe("acceptee");
      expect(await gainDe(livreur.livreur.id)).toBe(0);
    });

    it("trois codes faux bloquent le colis (423) : le bon code ne passe plus, aucun gain, jusqu'au déblocage", async () => {
      const { livreur, colis, id } = await missionAcceptee();
      const faux = fauxCode(colis.code);
      expect((await remettre(livreur.compte.jeton, id, colis, { code: faux })).status).toBe(422);
      expect((await remettre(livreur.compte.jeton, id, colis, { code: faux })).status).toBe(422);
      expect((await remettre(livreur.compte.jeton, id, colis, { code: faux })).status).toBe(423);
      expect((await remettre(livreur.compte.jeton, id, colis)).status).toBe(423);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_livraison");
      expect(await gainDe(livreur.livreur.id)).toBe(0);
      expect(t.portefeuille.creditsLignes.size).toBe(0);

      await t
        .http()
        .post(`/agence/colis/${colis.colisId}/deblocage`)
        .set(entete(e.superviseur.jeton))
        .expect(204);
      expect((await remettre(livreur.compte.jeton, id, colis)).status).toBe(200);
      expect(await gainDe(livreur.livreur.id)).toBe(700);
    });

    it("exige la pièce vue, la photo et un code à 6 chiffres : 400, rien ne change", async () => {
      const { livreur, colis, id } = await missionAcceptee();
      for (const over of [
        { pieceVerifiee: false },
        { pieceVerifiee: undefined },
        { photoRef: undefined },
        { photoRef: "" },
        { code: "123" },
        { code: undefined },
      ]) {
        const rep = await remettre(livreur.compte.jeton, id, colis, over);
        expect(rep.status, JSON.stringify(over)).toBe(400);
      }
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_livraison");
      expect(await gainDe(livreur.livreur.id)).toBe(0);
    });

    it("avec le bon code : colis livré, 700 F crédités une seule fois, preuve envoyée aux deux", async () => {
      const { livreur, colis, id } = await missionAcceptee();
      const rep = await remettre(livreur.compte.jeton, id, colis);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaColisLivre.parse(rep.body);
      expect(vue).toMatchObject({
        missionId: id,
        gain: 700,
        photoTransmise: true,
        colis: { etat: "livre" },
      });
      expect(contrats.fuitesCodeRetrait(rep.body, [colis.code])).toEqual([]);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("livre");
      expect(t.missionsRepo.lignes.get(id)?.etat).toBe("livree");
      expect(await gainDe(livreur.livreur.id)).toBe(700);
      expect(dernierSmsA(t, e.destinataire.telephone)).toContain(colis.numero);
      expect(dernierSmsA(t, e.expediteur.telephone)).toContain(colis.numero);

      const encore = await remettre(livreur.compte.jeton, id, colis);
      expect(encore.status).toBe(409);
      expect(encore.body.code).toBe("mission_deja_traitee");
      expect([...t.portefeuille.creditsLignes.keys()]).toEqual([`mission:${id}`]);

      const bilan = await espace(livreur.compte.jeton);
      expect(bilan.body.bilan).toMatchObject({
        aujourdhui: { livraisons: 1, gain: 700 },
        semaine: { livraisons: 1, gain: 700 },
      });
      expect(bilan.body.retrait.solde).toBe(700);
    });

    it("la preuve est dite non transmise quand un SMS ne part pas, sans défaire la remise", async () => {
      const { livreur, colis, id } = await missionAcceptee();
      const envoyer = t.sms.envoyer.bind(t.sms);
      t.sms.envoyer = async () => {
        throw new Error("fournisseur SMS en panne");
      };
      const rep = await remettre(livreur.compte.jeton, id, colis);
      t.sms.envoyer = envoyer;
      expect(rep.status).toBe(200);
      expect(rep.body.photoTransmise).toBe(false);
      expect(await gainDe(livreur.livreur.id)).toBe(700);
    });

    it("un autre livreur ne peut pas remettre ce colis, même avec le bon code", async () => {
      const { colis, id, livreur } = await missionAcceptee();
      const autre = await t.creerLivreur();
      const rep = await remettre(autre.compte.jeton, id, colis);
      expect(rep.status).toBe(404);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_livraison");
      expect(await gainDe(autre.livreur.id)).toBe(0);
      expect(await gainDe(livreur.livreur.id)).toBe(0);
    });

    it("les rôles : un voyageur, un relais ou un agent n'accèdent pas aux routes du livreur", async () => {
      const { colis, id } = await missionAcceptee();
      const relais = await t.creerRelais();
      for (const jeton of [
        e.expediteur.jeton,
        relais.compte.jeton,
        e.agent.jeton,
        e.guichetier.jeton,
      ]) {
        expect((await remettre(jeton, id, colis)).status).toBe(403);
        expect((await espace(jeton)).status).toBe(403);
        expect((await accepter(jeton, id)).status).toBe(403);
      }
      expect((await t.http().get("/livreurs/moi")).status).toBe(401);
    });
  });

  describe("destinataire absent : 10 minutes, puis le relais le plus proche", () => {
    async function missionAcceptee() {
      const livreur = await t.creerLivreur();
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(livreur.compte.jeton))!;
      await accepter(livreur.compte.jeton, id);
      return { livreur, colis, id };
    }

    it("attend 10 minutes, prévient la destinataire, puis dépose le colis au relais et le livreur est payé", async () => {
      const { relais, compte: proprietaire } = await t.creerRelais();
      const { livreur, colis, id } = await missionAcceptee();

      const rep = await absence(livreur.compte.jeton, id);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaAbsenceEnregistree.parse(rep.body);
      expect(vue).toMatchObject({
        attenteMinutes: 10,
        relaisDeRepli: { id: relais.id, nom: relais.nom },
      });
      expect(dernierSmsA(t, e.destinataire.telephone)).toContain("10 minutes");
      const nbSms = t.sms.messages().length;

      // Signaler une seconde fois ne relance pas l'attente et n'envoie pas un deuxième SMS.
      t.horloge.avancer(3 * MINUTE);
      const encore = await absence(livreur.compte.jeton, id);
      expect(encore.body.attenteJusqua).toBe(vue.attenteJusqua);
      expect(t.sms.messages().length).toBe(nbSms);

      t.horloge.avancer(6 * MINUTE + 59 * SECONDE);
      expect((await t.missions.avancer()).colisDeposesAuRelais).toBe(0);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("en_livraison");

      t.horloge.avancer(SECONDE);
      expect((await t.missions.avancer()).colisDeposesAuRelais).toBe(1);
      expect((await t.missions.avancer()).colisDeposesAuRelais).toBe(0);
      expect(await t.repo.trouver(colis.colisId)).toMatchObject({
        etat: "en_relais",
        relaisId: relais.id,
      });
      expect(t.missionsRepo.lignes.get(id)?.etat).toBe("repli");
      expect(await gainDe(livreur.livreur.id)).toBe(700);
      expect(dernierSmsA(t, e.destinataire.telephone)).toContain(relais.nom);

      // Le relais peut maintenant remettre le colis contre le code, et touche ses 200 F.
      const remise = await t
        .http()
        .post("/relais/moi/remises")
        .set(entete(proprietaire.jeton))
        .send({
          colisId: colis.colisId,
          code: colis.code,
          pieceVerifiee: true,
          photoRef: "photos/r.jpg",
        });
      expect(remise.status, JSON.stringify(remise.body)).toBe(200);
      expect(await t.portefeuille.solde("relais", relais.id)).toBe(200);
    });

    it("le destinataire arrive pendant l'attente : la remise passe, et plus rien n'est déposé au relais", async () => {
      await t.creerRelais();
      const { livreur, colis, id } = await missionAcceptee();
      await absence(livreur.compte.jeton, id);
      t.horloge.avancer(5 * MINUTE);
      expect((await remettre(livreur.compte.jeton, id, colis)).status).toBe(200);
      t.horloge.avancer(10 * MINUTE);
      expect((await t.missions.avancer()).colisDeposesAuRelais).toBe(0);
      expect((await t.repo.trouver(colis.colisId))?.etat).toBe("livre");
      expect(await gainDe(livreur.livreur.id)).toBe(700);
    });

    it("choisit le relais le plus proche de l'adresse parmi ceux qui prennent le colis et ont de la place", async () => {
      t.lieux.poserAdresse("Tamdja, Bafoussam", "Bafoussam", { lat: 5.4737, lon: 10.4179 });
      t.lieux.gares.set("00000000-0000-4000-8000-0000000000a2", { lat: 5.48, lon: 10.42 });
      await t.creerRelais({ nom: "Loin", position: { lat: 5.52, lon: 10.46 } });
      await t.creerRelais({
        nom: "Petit",
        position: { lat: 5.4738, lon: 10.4179 },
        tailleMax: "Petits seulement (≤ 1 kg)",
      });
      const proche = await t.creerRelais({ nom: "Proche", position: { lat: 5.474, lon: 10.418 } });
      const { livreur, id } = await missionAcceptee();

      const rep = await absence(livreur.compte.jeton, id);
      expect(rep.body.relaisDeRepli).toEqual({ id: proche.relais.id, nom: "Proche" });
    });

    it("sans relais qui puisse recevoir le colis : 409, la mission continue", async () => {
      const { livreur, id } = await missionAcceptee();
      const rep = await absence(livreur.compte.jeton, id);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("aucun_relais_de_repli");
      expect(t.missionsRepo.lignes.get(id)?.etat).toBe("acceptee");
      expect(t.missionsRepo.lignes.get(id)?.absence).toBeNull();
    });

    it("n'est possible que pour la mission acceptée du livreur", async () => {
      await t.creerRelais();
      const { livreur, id } = await missionAcceptee();
      const autre = await t.creerLivreur();
      expect((await absence(autre.compte.jeton, id)).status).toBe(404);
      expect(
        (await absence(livreur.compte.jeton, "00000000-0000-4000-8000-00000000dead")).status,
      ).toBe(404);
      expect(t.missionsRepo.lignes.get(id)?.absence).toBeNull();
    });
  });

  describe("suivi en direct", () => {
    it("publie la proposition (strictement conforme au contrat), son expiration, puis le temps restant", async () => {
      const a = await t.creerLivreur({ numero: 1 });
      const b = await t.creerLivreur({ numero: 2 });
      const colis = await colisMoto();
      await t.missions.ouvrirMissions();
      const id = (await propositionDe(a.compte.jeton))!;

      t.horloge.avancer(30 * SECONDE);
      await t.missions.avancer();

      const pourA = t.diffusionLivraison.missionsPubliees.filter(
        (m) => m.livreurId === a.livreur.id,
      );
      expect(pourA.map((m) => m.message.type)).toEqual(["proposee", "expiree"]);
      for (const { message } of t.diffusionLivraison.missionsPubliees) {
        contrats.SchemaMessageMissions.parse(message);
      }
      expect(
        contrats.fuitesCodeRetrait(t.diffusionLivraison.missionsPubliees, [colis.code]),
      ).toEqual([]);
      const pourB = t.diffusionLivraison.missionsPubliees.filter(
        (m) => m.livreurId === b.livreur.id,
      );
      expect(pourB.map((m) => m.message.type)).toEqual(["proposee"]);

      await accepter(b.compte.jeton, id);
      t.horloge.avancer(4 * MINUTE);
      await t.missions.avancer();
      await t.missions.avancer();
      const positions = t.diffusionLivraison.positionsPubliees;
      for (const p of positions) contrats.SchemaPositionLivreur.parse(p);
      expect(positions.map((p) => p.minutesRestantes)).toEqual([10, 6]);
    });

    it("les écouteurs reçoivent les messages tant qu'ils sont abonnés", async () => {
      const a = await t.creerLivreur();
      const recus: string[] = [];
      const stop = await t.livreurs.suivreMissions(
        { id: a.compte.id, role: "livreur", compagnieId: null, gareId: null },
        (m) => recus.push(m.type),
      );
      await colisMoto();
      await t.missions.ouvrirMissions();
      expect(recus).toEqual(["proposee"]);
      stop();
      t.horloge.avancer(30 * SECONDE);
      await t.missions.avancer();
      expect(recus).toEqual(["proposee"]);
    });
  });
});
