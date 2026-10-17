import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../socle/config/config";
import { VerificationPortsInterAgences } from "./inter-agences.module";
import { BilletsEmis, CompteursReferences, InvitationsCompagnies } from "./ports";
import {
  ALPHA,
  BETA,
  D_ALPHA_COLIS,
  D_OMEGA,
  creerAppInterAgencesTest,
  entete,
  type AppInterAgencesTest,
} from "./testing/app-inter-agences-test";

describe("inter-agences : qui a le droit de quoi, et étanchéité entre compagnies", () => {
  let t: AppInterAgencesTest;
  let conventionId: string;
  let colisId: string;

  beforeEach(async () => {
    t = await creerAppInterAgencesTest();
    conventionId = await t.conventionEnVigueur();
    colisId = (await t.colisEnCorrespondance()).colisId;
  });
  afterEach(async () => {
    await t.fermer();
  });

  const get = (chemin: string, jeton?: string) => {
    const r = t.http().get(chemin);
    return jeton ? r.set(entete(jeton)) : r;
  };

  it("sans jeton : 401 partout", async () => {
    for (const chemin of [
      "/inter-agences",
      "/inter-agences/reglement",
      `/inter-agences/conventions/${conventionId}`,
      "/inter-agences/propositions",
      "/inter-agences/correspondances",
      `/inter-agences/colis/${colisId}`,
      "/inter-agences/billets",
      "/patron/inter-agences",
      `/patron/inter-agences/conventions/${conventionId}`,
    ]) {
      expect((await get(chemin)).status, chemin).toBe(401);
    }
    const scan = await t.http().post("/inter-agences/transferts").send({});
    expect(scan.status).toBe(401);
  });

  it("un voyageur n'a accès à rien : 403", async () => {
    const jeton = t.equipe.expediteur.jeton;
    for (const chemin of [
      "/inter-agences",
      "/inter-agences/reglement",
      `/inter-agences/conventions/${conventionId}`,
      `/inter-agences/colis/${colisId}`,
      "/inter-agences/billets",
      "/patron/inter-agences",
      `/patron/inter-agences/conventions/${conventionId}`,
    ]) {
      expect((await get(chemin, jeton)).status, chemin).toBe(403);
    }
  });

  it("les planches de lecture sont pour le patron et le comptable, pas pour le guichet ni le terrain", async () => {
    const comptable = await t.compte("comptable", { compagnieId: ALPHA });
    for (const chemin of [
      "/inter-agences",
      "/inter-agences/reglement",
      `/inter-agences/conventions/${conventionId}`,
      "/patron/inter-agences",
      `/patron/inter-agences/conventions/${conventionId}`,
    ]) {
      expect((await get(chemin, comptable.jeton)).status, `comptable ${chemin}`).toBe(200);
      expect(
        (await get(chemin, t.equipe.guichetierAlpha.jeton)).status,
        `guichetier ${chemin}`,
      ).toBe(403);
      expect((await get(chemin, t.equipe.convoyeurAlpha.jeton)).status, `convoyeur ${chemin}`).toBe(
        403,
      );
    }
  });

  it("le comptable ne signe, ne propose, ne dénonce ni n'invite : seuls les patrons engagent la compagnie", async () => {
    const comptable = await t.compte("comptable", { compagnieId: ALPHA });
    const jeton = comptable.jeton;
    const essais = [
      () =>
        t
          .http()
          .post("/inter-agences/conventions")
          .set(entete(jeton))
          .send({ ...t.signature() }),
      () =>
        t
          .http()
          .post(`/inter-agences/conventions/${conventionId}/denonciation`)
          .set(entete(jeton))
          .send(t.signature()),
      () =>
        t
          .http()
          .post("/inter-agences/invitations")
          .set(entete(jeton))
          .send({ compagnie: "Bêta", patron: "+237691000009" }),
    ];
    for (const essai of essais) {
      expect((await essai()).status).toBe(403);
    }
  });

  it("le guichet enregistre les colis et billets ; le convoyeur scanne ; l'inverse est interdit", async () => {
    const colis = await t.creerColis();
    const corps = { colisId: colis.colisId, departIds: [D_ALPHA_COLIS.id, D_OMEGA.id] };
    expect(
      (
        await t
          .http()
          .post("/inter-agences/colis")
          .set(entete(t.equipe.convoyeurAlpha.jeton))
          .send(corps)
      ).status,
    ).toBe(403);
    expect(
      (
        await t
          .http()
          .post("/inter-agences/colis")
          .set(entete(t.equipe.guichetierAlpha.jeton))
          .send(corps)
      ).status,
    ).toBe(201);
    const scanGuichet = await t.scanner(
      t.equipe.guichetierAlpha.jeton,
      colisId,
      "remis_a",
      "Oméga",
    );
    // Le guichetier de la gare de correspondance peut aussi scanner : c'est un rôle de terrain.
    expect(scanGuichet.status).toBe(200);
  });

  describe("une troisième compagnie ne voit rien", () => {
    it("la convention, le colis, le règlement et la planche d'une paire dont elle ne fait pas partie : 404 ou vide", async () => {
      await t.passerLeTemoin(colisId);
      const jeton = t.equipe.patronBeta.jeton;
      expect((await get(`/inter-agences/conventions/${conventionId}`, jeton)).status).toBe(404);
      expect((await get(`/inter-agences/colis/${colisId}`, jeton)).status).toBe(404);

      const reglement = await get("/inter-agences/reglement", jeton);
      expect(reglement.body.creances).toEqual([]);
      expect(reglement.body.soldeNet).toBe(0);

      const planche = await get("/inter-agences", jeton);
      expect(planche.body.colis).toEqual([]);
      expect(planche.body.conventions).toEqual([]);

      const patron = await get("/patron/inter-agences", jeton);
      expect(patron.body.reglement.soldeNet).toBe(0);
      expect(patron.body.conventions).toEqual([]);
      expect(JSON.stringify(patron.body)).not.toContain(colisId);
    });

    it("elle ne peut ni signer, ni dénoncer, ni contester la convention des autres", async () => {
      const jeton = t.equipe.patronBeta.jeton;
      const signer = await t
        .http()
        .post(`/inter-agences/conventions/${conventionId}/signatures`)
        .set(entete(jeton))
        .send(t.signature());
      expect(signer.status).toBe(404);
      const denoncer = await t
        .http()
        .post(`/inter-agences/conventions/${conventionId}/denonciation`)
        .set(entete(jeton))
        .send(t.signature());
      expect(denoncer.status).toBe(404);
      expect((await t.conventionsRepo.trouver(conventionId))?.denonciation).toBeNull();
    });

    it("ses propres relevés ne contiennent jamais les créances d'autrui, même si elle a sa propre convention", async () => {
      await t.passerLeTemoin(colisId);
      // Bêta signe avec Alpha une autre convention : elle voit la sienne, jamais celle d'Alpha et Oméga.
      const p = await t
        .http()
        .post("/inter-agences/conventions")
        .set(entete(t.equipe.patronBeta.jeton))
        .send({
          compagnieId: ALPHA,
          parts: {
            colisType: { poidsKg: 3, prix: 3000 },
            lignes: [{ troncon: "Bafoussam → Bamenda", parts: { [ALPHA]: 1500, [BETA]: 1500 } }],
          },
          ...t.signature(),
        });
      expect(p.status, JSON.stringify(p.body)).toBe(201);
      const s = await t
        .http()
        .post(`/inter-agences/conventions/${p.body.id}/signatures`)
        .set(entete(t.equipe.patronAlpha.jeton))
        .send(t.signature());
      expect(s.status).toBe(200);

      const planche = await get("/inter-agences", t.equipe.patronBeta.jeton);
      expect(planche.body.conventions).toEqual([
        { id: p.body.id, partenaire: "Alpha", libelle: "Convention Alpha" },
      ]);
      expect(planche.body.colis).toEqual([]);
      expect(
        (await get(`/inter-agences/conventions/${conventionId}`, t.equipe.patronBeta.jeton)).status,
      ).toBe(404);
    });
  });

  describe("garde-fou de production", () => {
    const verifier = (env: string) =>
      new VerificationPortsInterAgences(
        { env } as AppConfig,
        t.conventionsRepo,
        t.plansRepo,
        t.billetsRepo,
        t.reglementsRepo,
        t.contestationsRepo,
        t.app.get(InvitationsCompagnies),
        t.app.get(CompteursReferences),
        t.annuaire,
        t.departs,
        t.app.get(BilletsEmis),
        t.operateur,
      );

    it("hors production, les ports en mémoire sont acceptés", () => {
      expect(() => verifier("test").onModuleInit()).not.toThrow();
      expect(() => verifier("development").onModuleInit()).not.toThrow();
    });

    it("en production, le démarrage est refusé tant qu'un port est en mémoire, et le message les nomme", () => {
      expect(() => verifier("production").onModuleInit()).toThrow(
        /ConventionsRepository.*ReglementsMobile/s,
      );
    });
  });
});
