import { colis as contrats } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  amenerJusquaDisponible,
  creerAppLivraisonTest,
  creerColis,
  creerEquipeRelais,
  dernierSmsA,
  entete,
  type AppLivraisonTest,
  type EquipeRelais,
} from "./testing/app-livraison-test";

const DEMANDE_MOTO = {
  deplacement: "moto",
  zone: "Bafoussam · Tamdja, Djeleng, centre",
  heures: "Soirs 17 h – 21 h",
  chargeMax: "10 kg · colis courants",
  momo: { telephone: "+237670000333", operateur: "mtn" },
  pieces: { permisRef: "photos/permis.jpg", assuranceRef: "photos/assurance.jpg" },
  reglesAcceptees: true,
};

const DEMANDE_VELO = { ...DEMANDE_MOTO, deplacement: "velo", pieces: {} };

const VERIFICATION_COMPLETE = {
  identite: true,
  pieces: { permisValideJusqua: "2030-01-31", assuranceExpireLe: "2027-12-31" },
  formation: true,
};

describe("devenir livreur : demande, vérification par un agent, activation", () => {
  let t: AppLivraisonTest;
  let e: EquipeRelais;

  beforeEach(async () => {
    t = await creerAppLivraisonTest();
    e = await creerEquipeRelais(t);
  });
  afterEach(async () => {
    await t.fermer();
  });

  const deposer = (jeton: string, demande: Record<string, unknown> = DEMANDE_MOTO) =>
    t.http().post("/partenaires/livreurs/demandes").set(entete(jeton)).send(demande);
  const agent = (chemin: string, corps: Record<string, unknown> = {}, jeton = e.agent.jeton) =>
    t.http().post(`/partenaires/livreurs/demandes/${chemin}`).set(entete(jeton)).send(corps);
  const suivi = (jeton: string) =>
    t.http().get("/partenaires/livreurs/demandes/moi").set(entete(jeton));

  it("le programme annonce 700 F par course et les vrais chiffres", async () => {
    const rep = await t.http().get("/partenaires/livreurs/programme").set(entete(e.inconnu.jeton));
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const vue = contrats.SchemaProgrammeLivreur.parse(rep.body);
    expect(vue).toMatchObject({ partParCourse: 700, livreursActifs: 0 });
    expect(vue.particularites.momo.valeurMasquee).toBe("6 77 •• •• 11 · MTN");
    expect(vue.regles.texte).toContain("Jamais de remise sans le code");
    expect(vue.mention).toContain("30 s");

    await t.creerLivreur();
    const apres = await t
      .http()
      .get("/partenaires/livreurs/programme")
      .set(entete(e.inconnu.jeton));
    expect(apres.body).toMatchObject({ livreursActifs: 1, villes: 1 });
  });

  it("n'est ouvert qu'aux voyageurs connectés", async () => {
    expect((await t.http().get("/partenaires/livreurs/programme")).status).toBe(401);
    const rep = await t
      .http()
      .get("/partenaires/livreurs/programme")
      .set(entete(e.guichetier.jeton));
    expect(rep.status).toBe(403);
    expect((await deposer(e.guichetier.jeton)).status).toBe(403);
  });

  describe("dépôt de la demande", () => {
    it("ouvre le dossier L-BAF-0001, prévient par SMS et annonce la formation", async () => {
      const rep = await deposer(e.inconnu.jeton);
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      const vue = contrats.SchemaDemandeDeposee.parse(rep.body);
      expect(vue.dossier).toBe("L-BAF-0001");
      expect(vue.suite).toContain("10 min de formation");
      expect(dernierSmsA(t, "+237677000111")).toContain("L-BAF-0001");
      expect((await deposer(e.expediteur.jeton)).body.dossier).toBe("L-BAF-0002");
    });

    it("sans MoMo dans la demande, le livreur est payé sur le MoMo du compte (le numéro proposé par le formulaire)", async () => {
      const { momo: _momo, ...sansMomo } = DEMANDE_MOTO;
      const rep = await deposer(e.inconnu.jeton, sansMomo);
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      contrats.SchemaDemandeDeposee.parse(rep.body);
      const [demande] = [...t.demandesLivreur.lignes.values()];
      expect(demande?.momo).toEqual({ telephone: "+237677000111", operateur: "mtn" });

      // Le MoMo du compte suit la demande jusqu'au livreur activé : c'est là que partent ses gains.
      const dossier = rep.body.dossier as string;
      await agent(`${dossier}/verification`, { identite: true });
      await agent(`${dossier}/verification`, { pieces: VERIFICATION_COMPLETE.pieces });
      await agent(`${dossier}/verification`, { formation: true });
      expect((await agent(`${dossier}/activation`, { moto: "OU 517 MT" })).status).toBe(200);
      const livreur = await t.livreursRepo.parPersonne(e.inconnu.id);
      expect(livreur?.momo).toEqual({ telephone: "+237677000111", operateur: "mtn" });
    });

    it("un MoMo donné dans la demande passe avant celui du compte ; un MoMo mal formé reste refusé", async () => {
      expect((await deposer(e.inconnu.jeton)).status).toBe(201);
      const [demande] = [...t.demandesLivreur.lignes.values()];
      expect(demande?.momo).toEqual({ telephone: "+237670000333", operateur: "mtn" });

      for (const momo of [null, "670000333", { telephone: "+237670000333" }, {}]) {
        const rep = await deposer(e.expediteur.jeton, { ...DEMANDE_MOTO, momo });
        expect(rep.status, JSON.stringify(momo)).toBe(400);
      }
      expect(t.demandesLivreur.lignes.size).toBe(1);
    });

    it("à moto, exige les photos du permis et de l'assurance ; à vélo ou à pied, non", async () => {
      const sansPermis = await deposer(e.inconnu.jeton, {
        ...DEMANDE_MOTO,
        pieces: { assuranceRef: "photos/assurance.jpg" },
      });
      expect(sansPermis.status).toBe(422);
      expect(sansPermis.body.code).toBe("demande_invalide");
      expect(JSON.stringify(sansPermis.body)).toContain("pieces.permisRef");
      expect(t.demandesLivreur.lignes.size).toBe(0);

      expect((await deposer(e.inconnu.jeton, DEMANDE_VELO)).status).toBe(201);
      expect(
        (await deposer(e.expediteur.jeton, { ...DEMANDE_VELO, deplacement: "pied" })).status,
      ).toBe(201);
    });

    it("refuse une zone, des heures ou une charge illisibles, avec le détail", async () => {
      const rep2 = await deposer(e.inconnu.jeton, {
        ...DEMANDE_MOTO,
        zone: "·",
        heures: "quand je peux",
        chargeMax: "beaucoup",
      });
      expect(rep2.status).toBe(422);
      const texte = JSON.stringify(rep2.body);
      for (const champ of ["zone", "heures", "chargeMax"]) expect(texte).toContain(champ);
      expect(t.demandesLivreur.lignes.size).toBe(0);
    });

    it("refuse un corps incomplet, des règles non signées ou un opérateur inconnu", async () => {
      for (const corps of [
        {},
        { ...DEMANDE_MOTO, reglesAcceptees: false },
        { ...DEMANDE_MOTO, reglesAcceptees: undefined },
        { ...DEMANDE_MOTO, deplacement: "fusée" },
        { ...DEMANDE_MOTO, momo: { telephone: "670000333", operateur: "mtn" } },
        { ...DEMANDE_MOTO, momo: { telephone: "+237670000333", operateur: "camtel" } },
        { ...DEMANDE_MOTO, pieces: undefined },
      ]) {
        expect((await deposer(e.inconnu.jeton, corps)).status, JSON.stringify(corps)).toBe(400);
      }
      expect(t.demandesLivreur.lignes.size).toBe(0);
    });

    it("refuse une seconde demande ouverte, même envoyée deux fois en même temps", async () => {
      const [a, b] = await Promise.all([deposer(e.inconnu.jeton), deposer(e.inconnu.jeton)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(t.demandesLivreur.lignes.size).toBe(1);
      expect((await deposer(e.inconnu.jeton)).body.code).toBe("demande_en_cours");
    });
  });

  describe("suivi de la demande", () => {
    it("montre cinq jalons qui se cochent un à un ; le dossier d'un autre est introuvable", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const rep = await suivi(e.inconnu.jeton);
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const vue = contrats.SchemaSuiviDemande.parse(rep.body);
      expect(vue).toMatchObject({
        type: "livreur",
        dossier: body.dossier,
        statut: "en_cours",
        etape: { courante: 2, total: 3 },
        reservation: { valeur: body.dossier, activation: "actif après la formation" },
        agent: null,
      });
      expect(vue.jalons.map((j) => j.fait)).toEqual([true, false, false, false, false]);
      expect(vue.complement?.texte).toContain("Soirs 17 h – 21 h");
      expect(vue.recit.texte).toContain("700 F");

      await agent(`${body.dossier}/verification`, { identite: true });
      expect(
        (await suivi(e.inconnu.jeton)).body.jalons.map((j: { fait: boolean }) => j.fait),
      ).toEqual([true, true, false, false, false]);

      const voleur = await t
        .http()
        .get(`/partenaires/livreurs/demandes/moi?dossier=${body.dossier}`)
        .set(entete(e.expediteur.jeton));
      expect(voleur.status).toBe(404);
      expect((await suivi(e.expediteur.jeton)).status).toBe(404);
    });

    it("à vélo, l'étape des pièces est faite d'office", async () => {
      await deposer(e.inconnu.jeton, DEMANDE_VELO);
      const rep = await suivi(e.inconnu.jeton);
      expect(rep.body.jalons.map((j: { fait: boolean }) => j.fait)).toEqual([
        true,
        false,
        true,
        false,
        false,
      ]);
    });
  });

  describe("agent AfriMove", () => {
    it("vérifie la CNI, les pièces et la formation, puis active : le livreur existe, le compte reçoit le rôle", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const dossier = body.dossier as string;

      const v1 = await agent(`${dossier}/verification`, { identite: true });
      expect(v1.status, JSON.stringify(v1.body)).toBe(200);
      // Pas d'activation tant que tout n'est pas vérifié.
      const tropTot = await agent(`${dossier}/activation`, { moto: "OU 517 MT" });
      expect(tropTot.status).toBe(409);
      expect(tropTot.body.code).toBe("verifications_incompletes");
      expect(t.livreursRepo.lignes.size).toBe(0);

      await agent(`${dossier}/verification`, { pieces: VERIFICATION_COMPLETE.pieces });
      await agent(`${dossier}/verification`, { formation: true });
      // À moto, l'immatriculation est relevée à l'activation.
      const sansMoto = await agent(`${dossier}/activation`);
      expect(sansMoto.status).toBe(422);
      expect(sansMoto.body.code).toBe("moto_requise");

      const activation = await agent(`${dossier}/activation`, { moto: "OU 517 MT" });
      expect(activation.status, JSON.stringify(activation.body)).toBe(200);
      const livreur = await t.livreursRepo.parPersonne(e.inconnu.id);
      expect(livreur).toMatchObject({
        badge: dossier,
        numero: 1,
        nom: "Passant",
        ville: "Bafoussam",
        deplacement: "moto",
        zone: DEMANDE_MOTO.zone,
        moto: "OU 517 MT",
        actif: true,
        disponible: false,
        note: 5,
        pieces: { permisValideJusqua: "2030-01-31", assuranceExpireLe: "2027-12-31" },
      });
      expect(t.roles.attributions).toEqual([{ personneId: e.inconnu.id, role: "livreur" }]);
      expect(dernierSmsA(t, "+237677000111")).toContain("badge livreur");

      const jeton = await t.jetonPour(e.inconnu.id, "livreur");
      const espace = await t.http().get("/livreurs/moi").set(entete(jeton));
      expect(espace.status, JSON.stringify(espace.body)).toBe(200);
      expect(espace.body.livreur).toMatchObject({ numero: 1, disponible: false });

      const fini = await suivi(e.inconnu.jeton);
      expect(fini.body).toMatchObject({ statut: "active", etape: { courante: 3, total: 3 } });
      expect(fini.body.jalons.every((j: { fait: boolean }) => j.fait)).toBe(true);
    });

    it("le nouveau livreur se met en ligne et reçoit sa première course", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const dossier = body.dossier as string;
      await agent(`${dossier}/verification`, VERIFICATION_COMPLETE);
      await agent(`${dossier}/activation`, { moto: "OU 517 MT" });
      const jeton = await t.jetonPour(e.inconnu.id, "livreur");

      const colis = await creerColis(t, e, {
        mode: "moto",
        adresseLivraison: "Djeleng, Bafoussam",
      });
      await amenerJusquaDisponible(t, e, colis.colisId);
      await t.missions.ouvrirMissions();
      expect((await t.http().get("/livreurs/moi").set(entete(jeton))).body.mission).toBeNull();

      await t
        .http()
        .put("/livreurs/moi/disponibilite")
        .set(entete(jeton))
        .send({ disponible: true })
        .expect(200);
      await t.missions.avancer();
      const espace = await t.http().get("/livreurs/moi").set(entete(jeton));
      // L'heure (09 h) est hors de « Soirs 17 h – 21 h » : pas de course avant ce soir.
      expect(espace.body.mission).toBeNull();
      t.horloge.avancer(9 * 3600_000);
      await t.missions.avancer();
      const soir = await t.http().get("/livreurs/moi").set(entete(jeton));
      expect(soir.body.mission).toMatchObject({ gain: 700, colis: { numero: colis.numero } });
    });

    it("refuse une pièce périmée et une date inexistante", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const dossier = body.dossier as string;
      const expiree = await agent(`${dossier}/verification`, {
        pieces: { permisValideJusqua: "2026-10-31", assuranceExpireLe: "2027-12-31" },
      });
      expect(expiree.status).toBe(422);
      expect(expiree.body.code).toBe("piece_expiree");
      for (const pieces of [
        { permisValideJusqua: "2028-02-30", assuranceExpireLe: "2027-12-31" },
        { permisValideJusqua: "demain", assuranceExpireLe: "2027-12-31" },
        { permisValideJusqua: "2030-01-31" },
      ]) {
        expect((await agent(`${dossier}/verification`, { pieces })).status).toBe(400);
      }
      expect(t.demandesLivreur.lignes.get(dossier)?.verifications.piecesA).toBeNull();
    });

    it("n'active qu'une fois, même en parallèle : un seul livreur", async () => {
      const { body } = await deposer(e.inconnu.jeton, DEMANDE_VELO);
      const dossier = body.dossier as string;
      await agent(`${dossier}/verification`, { identite: true, formation: true });
      const reponses = await Promise.all([
        agent(`${dossier}/activation`),
        agent(`${dossier}/activation`),
      ]);
      expect(reponses.map((r) => r.status)).toEqual([200, 200]);
      expect(t.livreursRepo.lignes.size).toBe(1);
      expect((await agent(`${dossier}/activation`)).status).toBe(200);
      expect(t.livreursRepo.lignes.size).toBe(1);
      expect(t.roles.attributions.filter((a) => a.role === "livreur")).toHaveLength(1);
      // Un livreur ne redépose pas de demande.
      const encore = await deposer(e.inconnu.jeton);
      expect(encore.status).toBe(409);
      expect(encore.body.code).toBe("deja_livreur");
    });

    it("refuse avec un motif ; une demande refusée ne s'active plus, mais le candidat peut redéposer", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const dossier = body.dossier as string;
      expect((await agent(`${dossier}/refus`, {})).status).toBe(400);
      expect((await agent(`${dossier}/refus`, { motif: "Permis illisible" })).status).toBe(200);
      expect(dernierSmsA(t, "+237677000111")).toContain("Permis illisible");
      expect((await suivi(e.inconnu.jeton)).body).toMatchObject({ statut: "refusee", etape: null });

      const verification = await agent(`${dossier}/verification`, VERIFICATION_COMPLETE);
      expect(verification.status).toBe(409);
      expect((await agent(`${dossier}/activation`, { moto: "OU 517 MT" })).status).toBe(409);
      expect(t.livreursRepo.lignes.size).toBe(0);
      expect((await deposer(e.inconnu.jeton)).status).toBe(201);
    });

    it("ne se fait qu'avec le rôle AfriMove", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const dossier = body.dossier as string;
      for (const jeton of [e.inconnu.jeton, e.superviseur.jeton, e.guichetier.jeton]) {
        for (const chemin of ["verification", "activation", "refus"]) {
          const rep = await agent(`${dossier}/${chemin}`, { identite: true, motif: "x" }, jeton);
          expect(rep.status, chemin).toBe(403);
        }
      }
      expect(t.demandesLivreur.lignes.get(dossier)?.etat).toBe("recue");
      expect(t.roles.attributions).toEqual([]);
    });

    it("un dossier inconnu répond 404", async () => {
      expect((await agent("L-XXX-9999/verification", { identite: true })).status).toBe(404);
    });
  });
});
