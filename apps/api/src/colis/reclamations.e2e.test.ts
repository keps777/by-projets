import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AUTRE_COMPAGNIE,
  creerAppColisTest,
  entete,
  type AppColisTest,
} from "./testing/app-colis-test";
import {
  creerColisApp,
  creerEquipe,
  scanner,
  type ColisApp,
  type Equipe,
} from "./testing/scenarios";

describe("réclamations de colis : traitement par la compagnie", () => {
  let t: AppColisTest;
  let e: Equipe;
  let afrimove: { id: string; jeton: string };

  beforeAll(async () => {
    t = await creerAppColisTest();
    e = await creerEquipe(t);
    afrimove = await t.compte("afrimove", { compagnieId: null, gareId: null });
  });
  afterAll(async () => {
    await t.fermer();
  });
  beforeEach(() => {
    t.horloge.regler();
    t.assureur.indisponible = false;
  });

  const neuf = (over: Record<string, unknown> = {}): Promise<ColisApp> =>
    creerColisApp(t, e, { photoRef: `photos/colis-${randomUUID()}.jpg`, ...over });

  const reclamer = async (colisId: string, motif: string, jeton = e.expediteur.jeton) => {
    const rep = await t
      .http()
      .post(`/colis/${colisId}/reclamations`)
      .set(entete(jeton))
      .send({ motif, message: "Je n'ai rien reçu" });
    expect(rep.status, JSON.stringify(rep.body)).toBe(201);
    return rep.body.reference as string;
  };

  const decider = (jeton: string, reference: string, corps: Record<string, unknown>) =>
    t.http().post(`/reclamations-colis/${reference}/decision`).set(entete(jeton)).send(corps);

  /** Colis chargé puis déclaré perdu par le superviseur : la perte est prouvée par le suivi. */
  async function colisPerdu(over: Record<string, unknown> = {}) {
    const colis = await neuf(over);
    await scanner(t, e.guichetier.jeton, { colisId: colis.colisId, action: "charger" });
    const reference = await reclamer(colis.colisId, "perdu");
    const perdu = await scanner(t, e.superviseur.jeton, {
      colisId: colis.colisId,
      action: "declarer_perdu",
    });
    expect(perdu.status, JSON.stringify(perdu.body)).toBe(200);
    return { colis, reference };
  }

  describe("liste", () => {
    it("montre à la compagnie ses réclamations, à AfriMove toutes, jamais à un voyageur", async () => {
      const colis = await neuf();
      const reference = await reclamer(colis.colisId, "retard");

      for (const jeton of [e.patron.jeton, e.superviseur.jeton, afrimove.jeton]) {
        const rep = await t.http().get("/reclamations-colis?statut=ouverte").set(entete(jeton));
        expect(rep.status).toBe(200);
        expect(rep.body).toContainEqual(
          expect.objectContaining({
            reference,
            colisId: colis.colisId,
            colis: colis.numero,
            motif: "retard",
            statut: "ouverte",
            decision: null,
          }),
        );
      }

      const etranger = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
      const chezAutre = await t.http().get("/reclamations-colis").set(entete(etranger.jeton));
      expect(chezAutre.status).toBe(200);
      expect(chezAutre.body).toEqual([]);

      expect(
        (await t.http().get("/reclamations-colis").set(entete(e.expediteur.jeton))).status,
      ).toBe(403);
      expect(
        (await t.http().get("/reclamations-colis").set(entete(e.guichetier.jeton))).status,
      ).toBe(403);
      expect((await t.http().get("/reclamations-colis")).status).toBe(401);
    });

    it("filtre par statut et refuse un statut inconnu", async () => {
      expect(
        (await t.http().get("/reclamations-colis?statut=bof").set(entete(e.patron.jeton))).status,
      ).toBe(400);
      const colis = await neuf();
      const reference = await reclamer(colis.colisId, "autre");
      await decider(e.patron.jeton, reference, { decision: "refusee", motif: "Hors garantie" });
      const refusees = await t
        .http()
        .get("/reclamations-colis?statut=refusee")
        .set(entete(e.patron.jeton));
      expect(refusees.body.map((r: { reference: string }) => r.reference)).toContain(reference);
      const ouvertes = await t
        .http()
        .get("/reclamations-colis?statut=ouverte")
        .set(entete(e.patron.jeton));
      expect(ouvertes.body.map((r: { reference: string }) => r.reference)).not.toContain(reference);
    });
  });

  describe("décision", () => {
    it("indemnise la valeur assurée d'un colis assuré perdu et déclare le sinistre à l'assureur", async () => {
      const { colis, reference } = await colisPerdu();
      const police = (await t.repo.trouver(colis.colisId))!.assurance.police;
      const avant = t.assureur.sinistres.length;

      const rep = await decider(e.patron.jeton, reference, { decision: "acceptee" });
      expect(rep.status, JSON.stringify(rep.body)).toBe(200);
      expect(rep.body).toMatchObject({
        reference,
        statut: "acceptee",
        decision: {
          le: "2026-11-02T09:00:00.000+01:00",
          indemnisation: { type: "valeur_assuree", montant: 25000 },
        },
      });
      expect(rep.body.decision.indemnisation.dossierAssureur).toMatch(/^SIN-/);
      expect(t.assureur.sinistres).toHaveLength(avant + 1);
      expect(t.assureur.sinistres.at(-1)).toMatchObject({ police, montant: 25000, motif: "perdu" });
      expect(
        t.auditRepo.lignes.some(
          (l) => l.action === "reclamation.decidee" && l.cibleId === colis.colisId,
        ),
      ).toBe(true);
    });

    it("indemnise 10 fois le port d'un colis non assuré perdu, sans assureur", async () => {
      const { reference } = await colisPerdu({ assurer: false });
      const avant = t.assureur.sinistres.length;
      const rep = await decider(e.superviseur.jeton, reference, { decision: "acceptee" });
      expect(rep.status).toBe(200);
      expect(rep.body.decision.indemnisation).toEqual({
        type: "multiple_port",
        montant: 15000,
        dossierAssureur: null,
      });
      expect(t.assureur.sinistres).toHaveLength(avant);
    });

    it("ne plafonne jamais au-delà de la perte prouvée, même si on demande plus", async () => {
      const { reference } = await colisPerdu({ assurer: false });
      const rep = await decider(e.patron.jeton, reference, {
        decision: "acceptee",
        montant: 90000,
      });
      expect(rep.body.decision.indemnisation.montant).toBe(15000);
      const { reference: autre } = await colisPerdu({ assurer: false });
      const moins = await decider(e.patron.jeton, autre, { decision: "acceptee", montant: 4000 });
      expect(moins.body.decision.indemnisation.montant).toBe(4000);
    });

    it("exige un montant quand la perte n'est pas prouvée, puis le traite en geste commercial", async () => {
      const colis = await neuf();
      const reference = await reclamer(colis.colisId, "retard");
      const sans = await decider(e.patron.jeton, reference, { decision: "acceptee" });
      expect(sans.status).toBe(422);
      expect(sans.body.code).toBe("perte_non_prouvee");
      expect((await t.reclamationsRepo.trouver(reference))?.statut).toBe("ouverte");

      const avant = t.assureur.sinistres.length;
      const avec = await decider(e.patron.jeton, reference, {
        decision: "acceptee",
        montant: 3000,
        motif: "Geste pour le retard",
      });
      expect(avec.status).toBe(200);
      expect(avec.body.decision).toMatchObject({
        indemnisation: { type: "geste_commercial", montant: 3000, dossierAssureur: null },
        motif: "Geste pour le retard",
      });
      // Un geste commercial n'est pas un sinistre.
      expect(t.assureur.sinistres).toHaveLength(avant);
    });

    it("plafonne un geste commercial à la valeur assurée (colis assuré) ou à 10 fois le port", async () => {
      const assure = await neuf();
      const ref1 = await reclamer(assure.colisId, "autre");
      const r1 = await decider(e.patron.jeton, ref1, { decision: "acceptee", montant: 80000 });
      expect(r1.body.decision.indemnisation).toMatchObject({
        type: "geste_commercial",
        montant: 25000,
      });

      const non = await neuf({ assurer: false });
      const ref2 = await reclamer(non.colisId, "autre");
      const r2 = await decider(e.patron.jeton, ref2, { decision: "acceptee", montant: 80000 });
      expect(r2.body.decision.indemnisation.montant).toBe(15000);
    });

    it("déclare un colis abîmé et assuré à l'assureur", async () => {
      const colis = await neuf();
      const reference = await reclamer(colis.colisId, "abime");
      const avant = t.assureur.sinistres.length;
      const rep = await decider(e.patron.jeton, reference, { decision: "acceptee", montant: 8000 });
      expect(rep.status).toBe(200);
      expect(rep.body.decision.indemnisation.dossierAssureur).toMatch(/^SIN-/);
      expect(t.assureur.sinistres).toHaveLength(avant + 1);
      expect(t.assureur.sinistres.at(-1)).toMatchObject({ montant: 8000, motif: "abime" });
    });

    it("refuse la réclamation sans indemnisation", async () => {
      const colis = await neuf();
      const reference = await reclamer(colis.colisId, "autre");
      const rep = await decider(e.patron.jeton, reference, {
        decision: "refusee",
        motif: "Colis remis",
      });
      expect(rep.status).toBe(200);
      expect(rep.body).toMatchObject({
        statut: "refusee",
        decision: { indemnisation: null, motif: "Colis remis" },
      });
    });

    it("répond une seule fois : la deuxième décision est refusée (409)", async () => {
      const colis = await neuf();
      const reference = await reclamer(colis.colisId, "autre");
      expect((await decider(e.patron.jeton, reference, { decision: "refusee" })).status).toBe(200);
      const deux = await decider(e.patron.jeton, reference, {
        decision: "acceptee",
        montant: 1000,
      });
      expect(deux.status).toBe(409);
      expect(deux.body.code).toBe("reclamation_close");
      expect((await t.reclamationsRepo.trouver(reference))?.statut).toBe("refusee");
    });

    it("ne déclare qu'un sinistre quand deux décisions arrivent en même temps", async () => {
      const { reference } = await colisPerdu();
      const avant = t.assureur.sinistres.length;
      const [a, b] = await Promise.all([
        decider(e.patron.jeton, reference, { decision: "acceptee" }),
        decider(e.superviseur.jeton, reference, { decision: "acceptee" }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(t.assureur.sinistres).toHaveLength(avant + 1);
    });

    it("garde la réclamation ouverte quand l'assureur ne répond pas, puis réussit au nouvel essai", async () => {
      const { reference } = await colisPerdu();
      const avant = t.assureur.sinistres.length;
      t.assureur.indisponible = true;
      const echec = await decider(e.patron.jeton, reference, { decision: "acceptee" });
      expect(echec.status).toBe(502);
      expect(echec.body.code).toBe("assureur_indisponible");
      expect((await t.reclamationsRepo.trouver(reference))?.statut).toBe("ouverte");
      expect(t.assureur.sinistres).toHaveLength(avant);

      t.assureur.indisponible = false;
      const ok = await decider(e.patron.jeton, reference, { decision: "acceptee" });
      expect(ok.status).toBe(200);
      expect(t.assureur.sinistres).toHaveLength(avant + 1);
    });

    it("ne laisse décider ni un voyageur, ni un guichetier, ni une autre compagnie", async () => {
      const colis = await neuf();
      const reference = await reclamer(colis.colisId, "autre");
      for (const jeton of [e.expediteur.jeton, e.guichetier.jeton, e.convoyeur.jeton]) {
        expect((await decider(jeton, reference, { decision: "refusee" })).status).toBe(403);
      }
      const etranger = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
      expect((await decider(etranger.jeton, reference, { decision: "refusee" })).status).toBe(404);
      expect(
        (await decider(e.patron.jeton, "R-000000-INCONN", { decision: "refusee" })).status,
      ).toBe(404);
      expect((await t.reclamationsRepo.trouver(reference))?.statut).toBe("ouverte");
      // AfriMove, lui, traite toutes les compagnies.
      expect((await decider(afrimove.jeton, reference, { decision: "refusee" })).status).toBe(200);
    });

    it("refuse une décision illisible", async () => {
      const colis = await neuf();
      const reference = await reclamer(colis.colisId, "autre");
      for (const corps of [
        {},
        { decision: "peut-être" },
        { decision: "acceptee", montant: -5 },
        { decision: "acceptee", montant: "beaucoup" },
        { decision: "refusee", motif: "x".repeat(501) },
      ]) {
        const rep = await decider(e.patron.jeton, reference, corps);
        expect(rep.status, JSON.stringify(corps)).toBe(400);
        expect(rep.body.code).toBe("REQUETE_INVALIDE");
      }
      expect((await t.reclamationsRepo.trouver(reference))?.statut).toBe("ouverte");
    });
  });

  it("garde un colis déjà perdu à l'état « perdu » quand son expéditeur réclame", async () => {
    const colis = await neuf();
    await scanner(t, e.guichetier.jeton, { colisId: colis.colisId, action: "charger" });
    await scanner(t, e.superviseur.jeton, { colisId: colis.colisId, action: "declarer_perdu" });
    await reclamer(colis.colisId, "perdu");
    expect((await t.repo.trouver(colis.colisId))?.etat).toBe("perdu");
  });
});
