import { colis as contrats, patron } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ColisInterAgencesStocke } from "./modele";
import { ReglementRefuse } from "./ports";
import {
  ALPHA,
  D_ALPHA_COLIS,
  D_OMEGA,
  OMEGA,
  allerA,
  creerAppInterAgencesTest,
  dernierSmsA,
  entete,
  type AppInterAgencesTest,
} from "./testing/app-inter-agences-test";

const DIMANCHE_19H = "2026-11-08T19:00:00.000+01:00";
const DIMANCHE_20H01 = "2026-11-08T20:01:00.000+01:00";
const LUNDI_07H = "2026-11-09T07:00:00.000+01:00";
const LUNDI_08H = "2026-11-09T08:00:00.000+01:00";
const LUNDI_SUIVANT_08H = "2026-11-16T08:00:00.000+01:00";

describe("règlement hebdomadaire : seulement ce que les scans rendent certain, réglé le lundi 08:00", () => {
  let t: AppInterAgencesTest;
  let conventionId: string;

  beforeEach(async () => {
    t = await creerAppInterAgencesTest();
    conventionId = await t.conventionEnVigueur();
  });
  afterEach(async () => {
    await t.fermer();
  });

  const reglement = (jeton: string) => t.http().get("/inter-agences/reglement").set(entete(jeton));

  const contester = (
    jeton: string,
    corps: Record<string, unknown> = { motif: "Colis jamais reçu" },
  ) => t.http().post("/inter-agences/reglement/contestations").set(entete(jeton)).send(corps);

  const trancher = (jeton: string, reference: string, issue: string) =>
    t
      .http()
      .post(`/inter-agences/contestations/${reference}/resolution`)
      .set(entete(jeton))
      .send({ issue });

  /** Un colis émis par Oméga que celle-ci a passé à Alpha (1 600 F pour Alpha) : un échange dans l'autre sens. */
  async function colisDOmegaPourAlpha(): Promise<string> {
    const colisId = "6b1a8c1e-5b0e-4b0f-9d3e-1d2f3a4b5c6d";
    const plan: ColisInterAgencesStocke = {
      colisId,
      version: 1,
      numero: "OME-BAF-261102-0007",
      conventionId,
      emettriceId: OMEGA,
      prix: 3000,
      troncons: [
        {
          rang: 1,
          compagnieId: OMEGA,
          departId: D_OMEGA.id,
          origine: "Bamenda",
          destination: "Bafoussam",
          heureDepart: "2026-11-02T08:00:00.000+01:00",
          heureArrivee: "2026-11-02T10:30:00.000+01:00",
          bus: D_OMEGA.bus,
          part: 1400,
        },
        {
          rang: 2,
          compagnieId: ALPHA,
          departId: D_ALPHA_COLIS.id,
          origine: "Bafoussam",
          destination: "Douala",
          heureDepart: "2026-11-02T11:00:00.000+01:00",
          heureArrivee: "2026-11-02T16:00:00.000+01:00",
          bus: D_ALPHA_COLIS.bus,
          part: 1600,
        },
      ],
      transferts: [
        {
          rang: 1,
          cedantId: OMEGA,
          preneurId: ALPHA,
          remis: { a: "2026-11-02T10:40:00.000+01:00", par: "p1", lieu: "Bafoussam" },
          recu: { a: "2026-11-02T10:50:00.000+01:00", par: "p2", lieu: "Bafoussam" },
        },
      ],
      creeLe: "2026-11-02T07:00:00.000+01:00",
      creePar: "p0",
    };
    expect(await t.plansRepo.ajouter(plan)).toBe(true);
    return colisId;
  }

  describe("le solde net ne vient que des scans", () => {
    it("un colis enregistré mais pas scanné ne doit rien, ni au relevé ni au solde", async () => {
      await t.colisEnCorrespondance();
      for (const jeton of [t.equipe.patronAlpha.jeton, t.equipe.patronOmega.jeton]) {
        const rep = await reglement(jeton);
        const r = contrats.SchemaReglementHebdo.parse(rep.body);
        expect(r.creances).toEqual([]);
        expect(r.soldeNet).toBe(0);
      }
    });

    it("« remis à » seul ne suffit pas : le passage de témoin doit être complet", async () => {
      const { colisId } = await t.colisEnCorrespondance();
      await t.scanner(t.equipe.convoyeurAlpha.jeton, colisId, "remis_a", "Oméga");
      const r = contrats.SchemaReglementHebdo.parse(
        (await reglement(t.equipe.patronOmega.jeton)).body,
      );
      expect(r.soldeNet).toBe(0);
      expect(await t.reglements.creancesDe(conventionId)).toEqual([]);
    });

    it("après « reçu » : Alpha, qui a encaissé le client, doit à Oméga sa part de 1 400 F", async () => {
      const { colisId } = await t.colisEnCorrespondance();
      await t.passerLeTemoin(colisId);

      const chezOmega = await reglement(t.equipe.patronOmega.jeton);
      const o = contrats.SchemaReglementHebdo.parse(chezOmega.body);
      expect(o).toMatchObject({
        titre: "Règlement entre compagnies · semaine",
        soldeNet: 1400,
        reglementLe: LUNDI_08H,
        contestationJusqua: "2026-11-08T20:00:00.000+01:00",
      });
      expect(o.creances).toEqual([
        { compagnie: "Alpha", sens: "nous_doivent", colis: 1, montant: 1400 },
      ]);

      const chezAlpha = contrats.SchemaReglementHebdo.parse(
        (await reglement(t.equipe.patronAlpha.jeton)).body,
      );
      expect(chezAlpha.soldeNet).toBe(-1400);
      expect(chezAlpha.creances).toEqual([
        { compagnie: "Oméga", sens: "nous_devons", colis: 1, montant: 1400 },
      ]);
    });

    it("des échanges dans les deux sens se compensent : seul le solde net est réglé", async () => {
      const { colisId } = await t.colisEnCorrespondance();
      await t.passerLeTemoin(colisId);
      await colisDOmegaPourAlpha();

      const chezAlpha = contrats.SchemaReglementHebdo.parse(
        (await reglement(t.equipe.patronAlpha.jeton)).body,
      );
      expect(chezAlpha.creances).toEqual([
        { compagnie: "Oméga", sens: "nous_doivent", colis: 1, montant: 1600 },
        { compagnie: "Oméga", sens: "nous_devons", colis: 1, montant: 1400 },
      ]);
      expect(chezAlpha.soldeNet).toBe(200);

      allerA(t, LUNDI_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 1 });
      const [envoi] = [...t.operateur.envoyes.values()];
      expect(envoi).toMatchObject({
        montant: 200,
        debiteur: { compagnieId: OMEGA },
        creancier: { compagnieId: ALPHA },
      });
    });

    it("un billet rend la part du second tronçon due seulement quand le voyageur est monté", async () => {
      t.vendreBillet();
      const enreg = await t
        .http()
        .post("/inter-agences/billets")
        .set(entete(t.equipe.guichetierAlpha.jeton))
        .send({ billet: "ALP-YDE-261102-0142", departId: D_OMEGA.id });
      expect(enreg.status, JSON.stringify(enreg.body)).toBe(201);
      expect(
        contrats.SchemaReglementHebdo.parse((await reglement(t.equipe.patronOmega.jeton)).body)
          .soldeNet,
      ).toBe(0);

      await t
        .http()
        .post(`/inter-agences/billets/${enreg.body.id}/embarquements`)
        .set(entete(t.equipe.convoyeurAlpha.jeton))
        .send({ rang: 1 });
      // Embarqué dans son propre bus : Alpha ne se doit rien à elle-même.
      expect(
        contrats.SchemaReglementHebdo.parse((await reglement(t.equipe.patronOmega.jeton)).body)
          .soldeNet,
      ).toBe(0);

      await t
        .http()
        .post(`/inter-agences/billets/${enreg.body.id}/embarquements`)
        .set(entete(t.equipe.convoyeurOmega.jeton))
        .send({ rang: 2 });
      const o = contrats.SchemaReglementHebdo.parse(
        (await reglement(t.equipe.patronOmega.jeton)).body,
      );
      expect(o.soldeNet).toBe(3000);
      expect(o.creances).toEqual([
        { compagnie: "Alpha", sens: "nous_doivent", colis: 1, montant: 3000 },
      ]);
    });

    it("un scan après le gel du dimanche 20:00 passe au règlement de la semaine suivante", async () => {
      const { colisId } = await t.colisEnCorrespondance();
      allerA(t, DIMANCHE_20H01);
      await t.passerLeTemoin(colisId);

      // Le relevé affiché est déjà celui du lundi 16, le gel de celui du 9 est passé.
      allerA(t, LUNDI_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 0 });
      expect(t.operateur.appels).toBe(0);

      allerA(t, LUNDI_SUIVANT_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 1 });
      expect([...t.operateur.envoyes.values()][0]?.montant).toBe(1400);
    });
  });

  describe("le paiement du lundi à 08:00", () => {
    async function colisPasse() {
      const colis = await t.colisEnCorrespondance();
      await t.passerLeTemoin(colis.colisId);
      return colis;
    }

    it("rien n'est payé avant le lundi 08:00", async () => {
      await colisPasse();
      allerA(t, LUNDI_07H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 0, payes: 0 });
      expect(t.operateur.appels).toBe(0);
    });

    it("à 08:00 le solde net part en MoMo, d'Alpha vers Oméga, et chaque patron est prévenu", async () => {
      await colisPasse();
      allerA(t, LUNDI_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 1 });

      const envoi = t.operateur.envoyes.get(`${conventionId}:261109`);
      expect(envoi).toMatchObject({
        cle: `${conventionId}:261109`,
        montant: 1400,
        debiteur: { compagnieId: ALPHA, momo: { telephone: "+237670000001", operateur: "mtn" } },
        creancier: {
          compagnieId: OMEGA,
          momo: { telephone: "+237670000002", operateur: "orange" },
        },
      });
      expect(dernierSmsA(t, t.equipe.patronOmega.telephone)).toMatch(/1\s?400/);
      expect(dernierSmsA(t, t.equipe.patronAlpha.telephone)).toMatch(/1\s?400/);
      const stocke = await t.reglementsRepo.trouver(`${conventionId}:261109`);
      expect(stocke).toMatchObject({ etat: "paye", montant: 1400, reference: "MOMO-000001" });
    });

    it("rejouer la tâche ne repaie rien : un règlement par convention et par lundi", async () => {
      await colisPasse();
      allerA(t, LUNDI_08H);
      await t.taches.reglerLeLundi();
      t.horloge.avancer(15 * 60_000);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 0, payes: 0 });
      expect(t.operateur.appels).toBe(1);
      expect(t.operateur.envoyes.size).toBe(1);
    });

    it("une opération déjà réglée ne revient pas la semaine suivante", async () => {
      await colisPasse();
      allerA(t, LUNDI_08H);
      await t.taches.reglerLeLundi();
      allerA(t, LUNDI_SUIVANT_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 0 });
      expect(t.operateur.envoyes.size).toBe(1);
      const suivant = await t.reglementsRepo.trouver(`${conventionId}:261116`);
      expect(suivant).toMatchObject({ etat: "sans_solde", montant: 0, lignes: [] });
    });

    it("un opérateur injoignable laisse le règlement à payer ; la tâche suivante le rejoue avec la même clé", async () => {
      await colisPasse();
      allerA(t, LUNDI_08H);
      t.operateur.echec = new Error("délai dépassé");
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 0 });
      expect(await t.reglementsRepo.trouver(`${conventionId}:261109`)).toMatchObject({
        etat: "a_payer",
        erreur: "inconnu",
      });
      t.horloge.avancer(15 * 60_000);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 0, payes: 1 });
      expect(t.operateur.envoyes.size).toBe(1);
      expect(await t.reglementsRepo.trouver(`${conventionId}:261109`)).toMatchObject({
        etat: "paye",
      });
    });

    it("un refus de l'opérateur est noté sans perdre le règlement", async () => {
      await colisPasse();
      allerA(t, LUNDI_08H);
      t.operateur.echec = new ReglementRefuse("solde insuffisant");
      await t.taches.reglerLeLundi();
      expect(await t.reglementsRepo.trouver(`${conventionId}:261109`)).toMatchObject({
        etat: "a_payer",
        erreur: "refuse",
      });
    });

    it("sans compte MoMo déclaré, le règlement attend : rien n'est envoyé", async () => {
      await colisPasse();
      t.annuaire.compagnies.set(OMEGA, { id: OMEGA, nom: "Oméga", momo: null });
      allerA(t, LUNDI_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 0 });
      expect(t.operateur.appels).toBe(0);
      expect(await t.reglementsRepo.trouver(`${conventionId}:261109`)).toMatchObject({
        etat: "a_payer",
        erreur: "compte_momo_manquant",
      });
      // Le compte déclaré, le règlement part au passage suivant.
      t.annuaire.compagnies.set(OMEGA, {
        id: OMEGA,
        nom: "Oméga",
        momo: { telephone: "+237670000002", operateur: "orange" },
      });
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 0, payes: 1 });
    });
  });

  describe("contestation jusqu'au dimanche 20:00", () => {
    async function colisPasse() {
      const colis = await t.colisEnCorrespondance();
      await t.passerLeTemoin(colis.colisId);
      return colis;
    }

    it("avant le gel : l'opération contestée sort du règlement, l'autre patron est prévenu", async () => {
      const { colisId } = await colisPasse();
      allerA(t, DIMANCHE_19H);
      const rep = await contester(t.equipe.patronAlpha.jeton, {
        motif: "Colis jamais reçu",
        colisIds: [colisId],
      });
      expect(rep.status, JSON.stringify(rep.body)).toBe(201);
      const c = contrats.SchemaContestationEnregistree.parse(rep.body);
      expect(c.recevable).toBe(true);
      expect(c.reference).toBe("CTX-261108-1");
      expect(dernierSmsA(t, t.equipe.patronOmega.telephone)).toContain("CTX-261108-1");

      const r = contrats.SchemaReglementHebdo.parse(
        (await reglement(t.equipe.patronAlpha.jeton)).body,
      );
      expect(r.soldeNet).toBe(0);
      expect(r.creances).toEqual([]);

      allerA(t, LUNDI_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 0 });
      expect(t.operateur.appels).toBe(0);
    });

    it("sans liste, toute la semaine est contestée", async () => {
      await colisPasse();
      const rep = await contester(t.equipe.patronOmega.jeton);
      expect(rep.status).toBe(201);
      expect(rep.body.recevable).toBe(true);
      expect(
        contrats.SchemaReglementHebdo.parse((await reglement(t.equipe.patronOmega.jeton)).body)
          .soldeNet,
      ).toBe(0);
    });

    it("après le dimanche 20:00 : enregistrée mais non recevable, le règlement part quand même", async () => {
      await colisPasse();
      allerA(t, DIMANCHE_20H01);
      const rep = await contester(t.equipe.patronAlpha.jeton);
      expect(rep.status).toBe(201);
      expect(contrats.SchemaContestationEnregistree.parse(rep.body).recevable).toBe(false);
      expect(dernierSmsA(t, t.equipe.patronOmega.telephone) ?? "").not.toContain("conteste");

      allerA(t, LUNDI_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 1 });
    });

    it("une opération qui n'est pas dans le relevé : 422 ; un relevé vide : 422", async () => {
      const vide = await contester(t.equipe.patronAlpha.jeton);
      expect(vide.status).toBe(422);
      expect(vide.body.code).toBe("releve_vide");
      await colisPasse();
      const inconnu = await contester(t.equipe.patronAlpha.jeton, {
        motif: "Doublon",
        colisIds: ["0d9f1c3a-0000-4000-8000-00000000abcd"],
      });
      expect(inconnu.status).toBe(422);
      expect(inconnu.body.code).toBe("colis_hors_releve");
    });

    it("une troisième compagnie ne conteste rien chez les autres : relevé vide pour elle", async () => {
      const { colisId } = await colisPasse();
      const rep = await contester(t.equipe.patronBeta.jeton, {
        motif: "Pas à moi",
        colisIds: [colisId],
      });
      expect(rep.status).toBe(422);
      expect(rep.body.code).toBe("colis_hors_releve");
    });

    it("le comptable lit le règlement mais ne conteste pas : 403", async () => {
      const comptable = await t.compte("comptable", { compagnieId: ALPHA });
      expect((await reglement(comptable.jeton)).status).toBe(200);
      expect((await contester(comptable.jeton)).status).toBe(403);
    });

    it("motif manquant : 400", async () => {
      const rep = await contester(t.equipe.patronAlpha.jeton, {});
      expect(rep.status).toBe(400);
    });
  });

  describe("la décision d'AfriMove", () => {
    async function contestee() {
      const { colisId } = await t.colisEnCorrespondance();
      await t.passerLeTemoin(colisId);
      const rep = await contester(t.equipe.patronAlpha.jeton, {
        motif: "Erreur de scan",
        colisIds: [colisId],
      });
      return rep.body.reference as string;
    }

    it("accordée : l'opération est écartée pour de bon, jamais réglée", async () => {
      const ref = await contestee();
      const rep = await trancher(t.equipe.afrimove.jeton, ref, "accordee");
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(rep.body.statut).toBe("accordee");
      allerA(t, LUNDI_08H);
      await t.taches.reglerLeLundi();
      allerA(t, LUNDI_SUIVANT_08H);
      await t.taches.reglerLeLundi();
      expect(t.operateur.appels).toBe(0);
    });

    it("rejetée : l'opération revient au règlement, payé dès le lundi qui suit", async () => {
      const ref = await contestee();
      allerA(t, LUNDI_08H);
      await t.taches.reglerLeLundi();
      expect(t.operateur.appels).toBe(0);
      const rep = await trancher(t.equipe.afrimove.jeton, ref, "rejetee");
      expect(rep.body.statut).toBe("rejetee");
      allerA(t, LUNDI_SUIVANT_08H);
      expect(await t.taches.reglerLeLundi()).toEqual({ arretes: 1, payes: 1 });
      expect([...t.operateur.envoyes.values()][0]?.montant).toBe(1400);
    });

    it("seul AfriMove tranche, une seule fois, sur une contestation qui existe", async () => {
      const ref = await contestee();
      expect((await trancher(t.equipe.patronOmega.jeton, ref, "accordee")).status).toBe(403);
      expect((await trancher(t.equipe.patronAlpha.jeton, ref, "accordee")).status).toBe(403);
      expect((await trancher(t.equipe.afrimove.jeton, "CTX-000000-9", "accordee")).status).toBe(
        404,
      );
      expect((await trancher(t.equipe.afrimove.jeton, ref, "peut-etre")).status).toBe(400);
      expect((await trancher(t.equipe.afrimove.jeton, ref, "rejetee")).status).toBe(200);
      const deuxieme = await trancher(t.equipe.afrimove.jeton, ref, "accordee");
      expect(deuxieme.status).toBe(409);
      expect(deuxieme.body.code).toBe("deja_resolue");
    });
  });

  describe("le bilan du trimestre dans la convention", () => {
    it("compte les colis échangés, les litiges, le délai de règlement et le net reçu", async () => {
      const { colisId } = await t.colisEnCorrespondance();
      await t.passerLeTemoin(colisId);
      const ref = (
        await contester(t.equipe.patronAlpha.jeton, { motif: "Vérification", colisIds: [colisId] })
      ).body.reference as string;
      t.horloge.avancer(2 * 24 * 3_600_000);
      await trancher(t.equipe.afrimove.jeton, ref, "rejetee");
      allerA(t, LUNDI_SUIVANT_08H);
      await t.taches.reglerLeLundi();

      const lire = async (jeton: string) =>
        contrats.SchemaConvention.parse(
          (await t.http().get(`/inter-agences/conventions/${conventionId}`).set(entete(jeton)))
            .body,
        );
      expect((await lire(t.equipe.patronOmega.jeton)).trimestre).toEqual({
        colisEchanges: 1,
        litiges: 1,
        delaiLitigeJours: 2,
        netRecu: 1400,
        lundis: 1,
      });
      expect((await lire(t.equipe.patronAlpha.jeton)).trimestre.netRecu).toBe(-1400);
    });
  });

  describe("la planche « Entre compagnies » du patron", () => {
    it("répond au contrat patron : colis, règlement du point de vue de la compagnie, conventions", async () => {
      const { colisId, numero } = await t.colisEnCorrespondance();
      await t.passerLeTemoin(colisId);
      const rep = await t
        .http()
        .get("/patron/inter-agences")
        .set(entete(t.equipe.patronOmega.jeton));
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      const v = patron.InterAgencesSchema.parse(rep.body);
      expect(v.colisEnCorrespondance).toMatchObject({
        colisId,
        numero,
        origine: "Douala",
        destination: "Bamenda",
      });
      expect(
        v.colisEnCorrespondance?.troncons.map((x) => [x.compagnie, x.part, x.heureDepart]),
      ).toEqual([
        ["Alpha", 1600, "10:00"],
        ["Oméga", 1400, "15:40"],
      ]);
      expect(v.reglement).toEqual({
        autreCompagnie: "Alpha",
        nousDoit: 1400,
        nbColisTransportesPourEux: 1,
        nousLeDevons: 0,
        nbColisEnCorrespondance: 0,
        soldeNet: 1400,
        reglementA: LUNDI_08H,
      });
      expect(v.correspondanceVoyageurs).toEqual({
        minutesGaranties: 25,
        attenteDuSecondBusMinutes: 15,
        // L'origine du billet voyageur : la ligne voyageurs de la convention (même donnée que /correspondances).
        trajet: {
          origine: "Yaoundé",
          via: "Bafoussam",
          destination: "Bamenda",
          premiere: "Alpha",
          seconde: "Oméga",
        },
      });
      expect(v.conventions).toEqual([{ id: conventionId, avec: "Alpha", statut: "active" }]);

      const alpha = patron.InterAgencesSchema.parse(
        (await t.http().get("/patron/inter-agences").set(entete(t.equipe.patronAlpha.jeton))).body,
      );
      expect(alpha.reglement).toMatchObject({
        autreCompagnie: "Oméga",
        nousLeDevons: 1400,
        soldeNet: -1400,
      });
    });

    it("choisit la convention demandée ; une convention d'autrui n'est pas un choix valable", async () => {
      const rep = await t
        .http()
        .get(`/patron/inter-agences?conventionId=${conventionId}`)
        .set(entete(t.equipe.patronBeta.jeton));
      expect(rep.status).toBe(200);
      expect(rep.body.conventions).toEqual([]);
      expect(rep.body.reglement.autreCompagnie).toBe("");
    });

    it("sans colis en correspondance, la planche reste conforme au contrat : la clé est absente, pas un colis vide", async () => {
      const rep = await t
        .http()
        .get("/patron/inter-agences")
        .set(entete(t.equipe.patronOmega.jeton));
      expect(rep.status).toBe(200);
      const v = patron.InterAgencesSchema.parse(rep.body);
      expect(v.colisEnCorrespondance).toBeUndefined();
      expect("colisEnCorrespondance" in rep.body).toBe(false);
      expect(v.conventions).toHaveLength(1);
      expect(v.correspondanceVoyageurs.trajet).toMatchObject({
        origine: "Yaoundé",
        via: "Bafoussam",
      });
    });

    it("une compagnie sans aucune convention reçoit tout de même une planche valide (ni colis ni trajet)", async () => {
      const rep = await t
        .http()
        .get("/patron/inter-agences")
        .set(entete(t.equipe.patronBeta.jeton));
      expect(rep.status).toBe(200);
      const v = patron.InterAgencesSchema.parse(rep.body);
      expect(v.colisEnCorrespondance).toBeUndefined();
      expect(v.correspondanceVoyageurs.trajet).toBeUndefined();
      expect(v.conventions).toEqual([]);
    });

    it("la convention du patron est celle du module colis : un seul contrat, même réponse, même étanchéité", async () => {
      const jeton = t.equipe.patronOmega.jeton;
      const patronRep = await t
        .http()
        .get(`/patron/inter-agences/conventions/${conventionId}`)
        .set(entete(jeton));
      expect(patronRep.status, JSON.stringify(patronRep.body)).toBe(200);
      const colisRep = await t
        .http()
        .get(`/inter-agences/conventions/${conventionId}`)
        .set(entete(jeton));
      expect(patronRep.body).toEqual(colisRep.body);
      const c = patron.ConventionSchema.parse(patronRep.body);
      expect(c.id).toBe(conventionId);
      expect(c.signatures.every((s) => s.parPin)).toBe(true);
      expect(c.pied.length).toBeGreaterThan(0);

      const beta = await t
        .http()
        .get(`/patron/inter-agences/conventions/${conventionId}`)
        .set(entete(t.equipe.patronBeta.jeton));
      expect(beta.status).toBe(404);
    });

    it("le trajet voyageur est vu du point de vue de la compagnie : la même ligne, première compagnie inchangée", async () => {
      const lire = async (jeton: string) =>
        patron.InterAgencesSchema.parse(
          (await t.http().get("/patron/inter-agences").set(entete(jeton))).body,
        );
      const omega = (await lire(t.equipe.patronOmega.jeton)).correspondanceVoyageurs.trajet;
      const alpha = (await lire(t.equipe.patronAlpha.jeton)).correspondanceVoyageurs.trajet;
      expect(alpha).toEqual(omega);
      expect(alpha?.premiere).toBe("Alpha");
    });
  });
});
