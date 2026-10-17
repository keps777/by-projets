import { colis as contrats } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  creerAppRelaisTest,
  creerEquipeRelais,
  dernierSmsA,
  entete,
  type AppRelaisTest,
  type EquipeRelais,
} from "./testing/app-relais-test";

const FICHE = {
  nom: "Boutique Chez Paul",
  type: "Boutique · alimentation",
  ouvert: "7 h – 20 h · lun.–sam.",
  position: { ville: "Bafoussam", quartier: "Tamdja", repere: "face au marché" },
  tailleMax: "Tous (≤ 30 kg)",
  momo: { telephone: "+237670000111", operateur: "mtn" },
  facadeRef: "photos/facade-paul.jpg",
};

describe("devenir point relais : demande, vérification par un agent, activation", () => {
  let t: AppRelaisTest;
  let e: EquipeRelais;

  beforeEach(async () => {
    t = await creerAppRelaisTest();
    e = await creerEquipeRelais(t);
  });
  afterEach(async () => {
    await t.fermer();
  });

  const deposer = (jeton: string, fiche: Record<string, unknown> = FICHE) =>
    t.http().post("/partenaires/relais/demandes").set(entete(jeton)).send(fiche);
  const agent = (chemin: string, corps: Record<string, unknown> = {}, jeton = e.agent.jeton) =>
    t.http().post(`/partenaires/relais/demandes/${chemin}`).set(entete(jeton)).send(corps);

  it("le programme annonce les gains réels (200 F par remise, 100 F par reprise)", async () => {
    const rep = await t.http().get("/partenaires/relais/programme").set(entete(e.inconnu.jeton));
    expect(rep.status, JSON.stringify(rep.body)).toBe(200);
    const vue = contrats.SchemaProgrammeRelais.parse(rep.body);
    expect(vue).toMatchObject({ partParColis: 200, partSiRepris: 100, relaisActifs: 0 });
    expect(vue.etapes.map((x) => x.rang)).toEqual([...vue.etapes.keys()].map((i) => i + 1));

    await t.creerRelais();
    const apres = await t.http().get("/partenaires/relais/programme").set(entete(e.inconnu.jeton));
    expect(apres.body).toMatchObject({ relaisActifs: 1, villes: 1 });
  });

  it("n'est ouvert qu'aux voyageurs connectés", async () => {
    expect((await t.http().get("/partenaires/relais/programme")).status).toBe(401);
    const rep = await t.http().get("/partenaires/relais/programme").set(entete(e.guichetier.jeton));
    expect(rep.status).toBe(403);
  });

  it("le formulaire se préremplit avec le brouillon et ne montre jamais le numéro MoMo en entier", async () => {
    const vide = await t.http().get("/partenaires/relais/formulaire").set(entete(e.inconnu.jeton));
    expect(vide.status, JSON.stringify(vide.body)).toBe(200);
    const formulaire = contrats.SchemaFormulaireRelais.parse(vide.body);
    expect(formulaire.fiche.nom).toBe("");
    expect(formulaire.fiche.momo.valeurMasquee).not.toContain("677000111");

    const brouillon = await t
      .http()
      .put("/partenaires/relais/brouillon")
      .set(entete(e.inconnu.jeton))
      .send({ fiche: { nom: "Boutique Chez Paul", momo: FICHE.momo } });
    expect(brouillon.status).toBe(200);
    contrats.SchemaBrouillonEnregistre.parse(brouillon.body);
    // Un second enregistrement complète le premier au lieu de l'écraser.
    await t
      .http()
      .put("/partenaires/relais/brouillon")
      .set(entete(e.inconnu.jeton))
      .send({ fiche: { type: "Pharmacie" } });

    const rempli = await t
      .http()
      .get("/partenaires/relais/formulaire")
      .set(entete(e.inconnu.jeton));
    expect(rempli.body.fiche.nom).toBe("Boutique Chez Paul");
    expect(rempli.body.fiche.type.valeur).toBe("Pharmacie");
    expect(rempli.body.fiche.momo.valeurMasquee).toContain("MTN");
    expect(JSON.stringify(rempli.body)).not.toContain("670000111");
  });

  it("refuse un brouillon dont un champ est invalide", async () => {
    const rep = await t
      .http()
      .put("/partenaires/relais/brouillon")
      .set(entete(e.inconnu.jeton))
      .send({ fiche: { momo: { telephone: "pas-un-numero", operateur: "mtn" } } });
    expect(rep.status).toBe(400);
    expect(t.brouillons.lignes.size).toBe(0);
  });

  describe("dépôt de la fiche", () => {
    it("ouvre le dossier R-BAF-0001, prévient par SMS et supprime le brouillon", async () => {
      await t
        .http()
        .put("/partenaires/relais/brouillon")
        .set(entete(e.inconnu.jeton))
        .send({ fiche: { nom: "Brouillon" } });

      const rep = await deposer(e.inconnu.jeton);
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      const vue = contrats.SchemaDemandeDeposee.parse(rep.body);
      expect(vue.dossier).toBe("R-BAF-0001");
      expect(dernierSmsA(t, "+237677000111")).toContain("R-BAF-0001");
      expect(t.brouillons.lignes.size).toBe(0);

      const autre = await deposer(e.expediteur.jeton);
      expect(autre.body.dossier).toBe("R-BAF-0002");
    });

    it("sans MoMo dans la fiche, le relais est payé sur le MoMo du compte (le numéro proposé par le formulaire)", async () => {
      const { momo: _momo, ...sansMomo } = FICHE;
      const rep = await deposer(e.inconnu.jeton, sansMomo);
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      contrats.SchemaDemandeDeposee.parse(rep.body);
      const [demande] = [...t.demandes.lignes.values()];
      expect(demande?.fiche.momo).toEqual({ telephone: "+237677000111", operateur: "mtn" });
    });

    it("sans MoMo dans la fiche mais avec un MoMo dans le brouillon, c'est celui du brouillon", async () => {
      const { momo: _momo, ...sansMomo } = FICHE;
      await t
        .http()
        .put("/partenaires/relais/brouillon")
        .set(entete(e.inconnu.jeton))
        .send({ fiche: { momo: { telephone: "+237699888777", operateur: "orange" } } });
      const rep = await deposer(e.inconnu.jeton, sansMomo);
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      const [demande] = [...t.demandes.lignes.values()];
      expect(demande?.fiche.momo).toEqual({ telephone: "+237699888777", operateur: "orange" });
    });

    it("un MoMo donné dans la fiche passe avant celui du compte", async () => {
      const rep = await deposer(e.inconnu.jeton);
      expect(rep.status).toBe(201);
      const [demande] = [...t.demandes.lignes.values()];
      expect(demande?.fiche.momo).toEqual({ telephone: "+237670000111", operateur: "mtn" });
    });

    it("un MoMo présent mais mal formé reste refusé (jamais remplacé en silence par celui du compte)", async () => {
      for (const momo of [null, "670000111", { telephone: "+237670000111" }, {}]) {
        expect(
          (await deposer(e.inconnu.jeton, { ...FICHE, momo })).status,
          JSON.stringify(momo),
        ).toBe(400);
      }
      expect(t.demandes.lignes.size).toBe(0);
    });

    it("refuse une seconde demande tant que la première est ouverte, même envoyée deux fois en même temps", async () => {
      const [a, b] = await Promise.all([deposer(e.inconnu.jeton), deposer(e.inconnu.jeton)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(t.demandes.lignes.size).toBe(1);
      const encore = await deposer(e.inconnu.jeton);
      expect(encore.status).toBe(409);
      expect(encore.body.code).toBe("demande_en_cours");
    });

    it("refuse une fiche illisible (type, horaires, taille) avec le détail des champs", async () => {
      const rep = await deposer(e.inconnu.jeton, {
        ...FICHE,
        type: "Casino",
        ouvert: "quand je veux",
        tailleMax: "énorme",
      });
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("fiche_invalide");
      expect(JSON.stringify(rep.body)).toContain("ouvert");
      expect(t.demandes.lignes.size).toBe(0);
    });

    it("refuse un corps incomplet ou mal formé", async () => {
      for (const corps of [
        {},
        { ...FICHE, nom: "" },
        { ...FICHE, momo: { telephone: "677", operateur: "mtn" } },
        { ...FICHE, momo: { telephone: "+237670000111", operateur: "camtel" } },
        { ...FICHE, facadeRef: undefined },
      ]) {
        expect((await deposer(e.inconnu.jeton, corps)).status).toBe(400);
      }
      expect(t.demandes.lignes.size).toBe(0);
    });

    it("refuse quelqu'un qui est déjà point relais", async () => {
      const { relais } = await t.creerRelais();
      // Le point relais garde son compte voyageur (rôles multiples) pour envoyer ses propres colis.
      await t.relaisRepo.ajouter({
        ...relais,
        id: "00000000-0000-4000-8000-0000000000f1",
        code: "R-BAF-0099",
        personneId: e.inconnu.id,
      });
      const rep = await deposer(e.inconnu.jeton);
      expect(rep.status).toBe(409);
      expect(rep.body.code).toBe("deja_relais");
      expect(t.demandes.lignes.size).toBe(0);
    });
  });

  describe("suivi de la demande", () => {
    it("montre les jalons en direct ; le dossier d'un autre est introuvable", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const rep = await t
        .http()
        .get("/partenaires/relais/demandes/moi")
        .set(entete(e.inconnu.jeton));
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const suivi = contrats.SchemaSuiviDemande.parse(rep.body);
      expect(suivi).toMatchObject({
        type: "relais",
        dossier: body.dossier,
        statut: "en_cours",
        etape: { courante: 2, total: 3 },
        reservation: { valeur: body.dossier },
      });
      expect(suivi.jalons.map((j) => j.fait)).toEqual([true, false, false, false, false]);

      const parDossier = await t
        .http()
        .get(`/partenaires/relais/demandes/moi?dossier=${body.dossier}`)
        .set(entete(e.inconnu.jeton));
      expect(parDossier.status).toBe(200);
      const voleur = await t
        .http()
        .get(`/partenaires/relais/demandes/moi?dossier=${body.dossier}`)
        .set(entete(e.expediteur.jeton));
      expect(voleur.status).toBe(404);
      const sans = await t
        .http()
        .get("/partenaires/relais/demandes/moi")
        .set(entete(e.expediteur.jeton));
      expect(sans.status).toBe(404);
    });
  });

  describe("agent AfriMove", () => {
    it("planifie la visite puis active : le relais existe, le compte reçoit le rôle, l'app passe en mode relais", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const dossier = body.dossier as string;

      const visite = await agent(`${dossier}/visite`, { agent: "Éric", creneau: "jeudi 10 h" });
      expect(visite.status, JSON.stringify(visite.body)).toBe(200);
      expect(dernierSmsA(t, "+237677000111")).toContain("jeudi 10 h");
      const enCours = await t
        .http()
        .get("/partenaires/relais/demandes/moi")
        .set(entete(e.inconnu.jeton));
      expect(enCours.body.agent).toEqual({ nom: "Éric", creneau: "jeudi 10 h" });
      expect(enCours.body.jalons.map((j: { fait: boolean }) => j.fait)).toEqual([
        true,
        true,
        false,
        false,
        false,
      ]);

      const activation = await agent(`${dossier}/activation`, {
        position: { lat: 5.4737, lon: 10.4179 },
        capacite: 20,
        particularite: "frigo pour médicaments",
      });
      expect(activation.status, JSON.stringify(activation.body)).toBe(200);
      const relais = await t.relaisRepo.parPersonne(e.inconnu.id);
      expect(relais).toMatchObject({
        code: dossier,
        nom: FICHE.nom,
        ville: "Bafoussam",
        capacite: 20,
        particularite: "frigo pour médicaments",
        actif: true,
        note: 5,
      });
      expect(t.roles.attributions).toEqual([{ personneId: e.inconnu.id, role: "relais" }]);

      // Le compte peut désormais se servir de l'app relais, et le colis peut lui être confié.
      const jeton = await t.jetonPour(e.inconnu.id, "relais");
      const espace = await t.http().get("/relais/moi").set(entete(jeton));
      expect(espace.status, JSON.stringify(espace.body)).toBe(200);
      expect(espace.body.boutique.nom).toBe(FICHE.nom);
      expect(await t.colis.referentiel.relais(relais!.id)).toMatchObject({ actif: true });

      const fini = await t
        .http()
        .get("/partenaires/relais/demandes/moi")
        .set(entete(e.inconnu.jeton));
      expect(fini.body).toMatchObject({ statut: "active", etape: { courante: 3, total: 3 } });
      expect(fini.body.reservation.activation).toBe("actif");
    });

    it("n'active pas avant la visite, ni deux fois, ni en même temps : un seul relais", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const dossier = body.dossier as string;

      const tropTot = await agent(`${dossier}/activation`);
      expect(tropTot.status).toBe(409);
      expect(t.relaisRepo.lignes.size).toBe(0);

      await agent(`${dossier}/visite`, { agent: "Éric", creneau: "jeudi 10 h" });
      const reponses = await Promise.all([
        agent(`${dossier}/activation`),
        agent(`${dossier}/activation`),
      ]);
      expect(reponses.map((r) => r.status)).toEqual([200, 200]);
      expect(t.relaisRepo.lignes.size).toBe(1);
      expect((await agent(`${dossier}/activation`)).status).toBe(200);
      expect(t.relaisRepo.lignes.size).toBe(1);
    });

    it("refuse la demande avec un motif ; le candidat peut redéposer ensuite", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const dossier = body.dossier as string;
      expect((await agent(`${dossier}/refus`, {})).status).toBe(400);
      const refus = await agent(`${dossier}/refus`, { motif: "Boutique fermée trop souvent" });
      expect(refus.status).toBe(200);
      expect(dernierSmsA(t, "+237677000111")).toContain("Boutique fermée trop souvent");

      const suivi = await t
        .http()
        .get("/partenaires/relais/demandes/moi")
        .set(entete(e.inconnu.jeton));
      expect(suivi.body).toMatchObject({ statut: "refusee", etape: null });
      expect(suivi.body.detail).toContain("Boutique fermée trop souvent");
      // Une demande refusée ne s'active plus.
      expect((await agent(`${dossier}/activation`)).status).toBe(409);
      expect(t.relaisRepo.lignes.size).toBe(0);
      expect((await deposer(e.inconnu.jeton)).status).toBe(201);
    });

    it("ne se fait qu'avec le rôle AfriMove", async () => {
      const { body } = await deposer(e.inconnu.jeton);
      const dossier = body.dossier as string;
      for (const jeton of [e.inconnu.jeton, e.superviseur.jeton, e.guichetier.jeton]) {
        for (const chemin of ["visite", "activation", "refus"]) {
          const rep = await agent(
            `${dossier}/${chemin}`,
            { agent: "x", creneau: "x", motif: "x" },
            jeton,
          );
          expect(rep.status, chemin).toBe(403);
        }
      }
      expect(t.demandes.lignes.get(dossier)?.etat).toBe("recue");
      expect(t.roles.attributions).toEqual([]);
    });

    it("un dossier inconnu répond 404", async () => {
      const rep = await agent("R-XXX-9999/visite", { agent: "Éric", creneau: "jeudi 10 h" });
      expect(rep.status).toBe(404);
    });
  });
});
