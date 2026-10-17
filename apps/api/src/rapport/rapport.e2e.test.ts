import type { AddressInfo } from "node:net";
import { patron } from "@afrimove/contrats";
import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AKWA,
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  GARE_AUTRE,
  JOUR,
  VINGT_ET_UNE_HEURES,
  billet,
  peuplerPlanche,
} from "./testing/montage";
import { creerAppRapportTest, type AppRapportTest } from "./testing/app-rapport-test";

let t: AppRapportTest;
let patronAlpha: { id: string; jeton: string };
let patronBeta: { id: string; jeton: string };
let patronSansCompagnie: { id: string; jeton: string };
let comptable: { id: string; jeton: string };
let superviseur: { id: string; jeton: string };
let guichetier: { id: string; jeton: string };
let voyageur: { id: string; jeton: string };
let afrimove: { id: string; jeton: string };

beforeAll(async () => {
  t = await creerAppRapportTest();
  patronAlpha = await t.compte("patron", { gareId: null });
  patronBeta = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE, gareId: null });
  patronSansCompagnie = await t.compte("patron", { compagnieId: null, gareId: null });
  comptable = await t.compte("comptable", { gareId: null });
  superviseur = await t.compte("superviseur");
  guichetier = await t.compte("guichetier");
  voyageur = await t.compte("voyageur", { compagnieId: null, gareId: null });
  afrimove = await t.compte("afrimove", { compagnieId: null, gareId: null });
});
afterAll(() => t.fermer());

const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
const rapport = (jeton: string, jour?: string) =>
  t
    .http()
    .get("/patron/rapports/soir")
    .query(jour ? { jour } : {})
    .set(avec(jeton));

describe("accès", () => {
  it("exige un jeton", async () => {
    await t.http().get("/patron/rapports/soir").expect(401);
  });

  it("est réservé au patron : tous les autres rôles reçoivent 403", async () => {
    for (const r of [comptable, superviseur, guichetier, voyageur, afrimove]) {
      await rapport(r.jeton).expect(403);
    }
    expect(
      t.auditRepo.lignes.filter((l) => l.action === "acces.refuse").length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("refuse un patron sans compagnie", async () => {
    const r = await rapport(patronSansCompagnie.jeton).expect(403);
    expect(r.body).toMatchObject({ code: "HORS_PERIMETRE" });
  });
});

describe("GET /patron/rapports/soir", () => {
  it("avant 21 h : le jour d'aujourd'hui n'est pas encore arrêté, hier est servi par défaut", async () => {
    // 08:00 le 5 janvier
    const pasEncore = await rapport(patronAlpha.jeton, JOUR).expect(404);
    expect(pasEncore.body).toMatchObject({ code: "RAPPORT_PAS_ENCORE" });

    const hier = await rapport(patronAlpha.jeton).expect(200);
    expect(hier.body.jour).toBe("2027-01-04");
    expect(patron.RapportSoirSchema.safeParse(hier.body).success).toBe(true);
  });

  it("à 21:00 : rend le rapport de la planche, conforme au contrat, avec la caisse non validée signalée", async () => {
    peuplerPlanche(t.montage);
    t.montage.allerA(VINGT_ET_UNE_HEURES);

    const res = await rapport(patronAlpha.jeton).expect(200);
    const lu = patron.RapportSoirSchema.parse(res.body);
    expect(lu.jour).toBe(JOUR);
    expect(lu.titre).toBe("Rapport du mardi 5 janvier · 3 gares");
    expect(lu.chiffres).toMatchObject({ billets: 1_004, colis: 312, recette: 4_410_000 });
    expect(lu.gares.find((g) => g.gareId === AKWA)).toMatchObject({ billets: 491, ecart: -1_000 });
    expect(lu.signatures.map((s) => s.nom)).toEqual(["Essono", "Tchinda", "Fosso"]);
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("le rapport lu est celui arrêté à 21 h : de nouvelles ventes ne le changent pas", async () => {
    const avant = (await rapport(patronAlpha.jeton, JOUR).expect(200)).body;
    t.montage.ventes.ajouter(COMPAGNIE, billet({ venduA: "2027-01-05T22:15:00.000+01:00" }));
    t.montage.horloge.avancer(2 * 3_600_000);
    const apres = (await rapport(patronAlpha.jeton, JOUR).expect(200)).body;
    expect(apres).toEqual(avant);
    expect(apres.envoyeA).toBe("2027-01-05T21:00:00.000+01:00");
  });

  it("chaque patron lit le rapport de sa compagnie, jamais celui d'une autre", async () => {
    t.montage.ventes.ajouter(
      AUTRE_COMPAGNIE,
      billet({ gareId: GARE_AUTRE, montant: 7_000, venduA: "2027-01-05T10:00:00.000+01:00" }),
    );
    const beta = (await rapport(patronBeta.jeton, JOUR).expect(200)).body;
    expect(beta.chiffres).toMatchObject({ billets: 1, recette: 7_000 });
    expect(beta.gares.map((g: { nom: string }) => g.nom)).toEqual(["Bonabéri"]);
    const alpha = (await rapport(patronAlpha.jeton, JOUR).expect(200)).body;
    expect(alpha.chiffres.billets).toBe(1_004);
  });

  it("refuse les paramètres inconnus et les jours impossibles (400), les jours futurs (404)", async () => {
    await t
      .http()
      .get("/patron/rapports/soir?compagnieId=x")
      .set(avec(patronAlpha.jeton))
      .expect(400);
    await t
      .http()
      .get("/patron/rapports/soir?jour=demain")
      .set(avec(patronAlpha.jeton))
      .expect(400);
    await t
      .http()
      .get("/patron/rapports/soir?jour=2027-02-30")
      .set(avec(patronAlpha.jeton))
      .expect(400);
    await t
      .http()
      .get("/patron/rapports/soir?jour=2027-01-05&jour=2027-01-04")
      .set(avec(patronAlpha.jeton))
      .expect(400);
    const futur = await rapport(patronAlpha.jeton, "2027-01-06").expect(404);
    expect(futur.body).toMatchObject({ code: "RAPPORT_PAS_ENCORE" });
    const ancien = await rapport(patronAlpha.jeton, "2026-06-01").expect(404);
    expect(ancien.body).toMatchObject({ code: "RAPPORT_INTROUVABLE" });
  });

  it("une panne des ventes répond 500 et n'écrit aucun rapport", async () => {
    t.montage.horloge.avancer(24 * 3_600_000); // le 6 janvier 2027 à 23:00 : le rapport du 6 est dû
    t.montage.ventes.enPanne = true;
    const silence = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    await rapport(patronAlpha.jeton, "2027-01-06").expect(500);
    silence.mockRestore();
    expect(await t.service.lire(COMPAGNIE, "2027-01-06")).toBeNull();
    t.montage.ventes.enPanne = false;
    await rapport(patronAlpha.jeton, "2027-01-06").expect(200);
  });
});

describe("avec le client d'API en mode HTTP (@afrimove/api-client)", () => {
  it("l'opération patron.rapport.soir fonctionne sur le serveur, réponse validée par le schéma du contrat", async () => {
    const { OP_RAPPORT_SOIR } = await import(
      "../../../../packages/api-client/src/patron/operations"
    );
    const { creerClientHttp } = await import("../../../../packages/api-client/src/infra/http");
    await t.app.listen(0, "127.0.0.1");
    const { port } = t.app.getHttpServer().address() as AddressInfo;

    const client = creerClientHttp({
      urlBase: `http://127.0.0.1:${port}`,
      obtenirJeton: () => patronAlpha.jeton,
      relance: { max: 0 },
    });
    expect(OP_RAPPORT_SOIR.methode).toBe("GET");
    expect(OP_RAPPORT_SOIR.chemin({ jour: JOUR })).toBe("/patron/rapports/soir");

    const r = await client.executer(OP_RAPPORT_SOIR, { jour: JOUR });
    expect(r.jour).toBe(JOUR);
    expect(r.chiffres.billets).toBe(1_004);

    const parDefaut = await client.executer(OP_RAPPORT_SOIR, {});
    expect(parDefaut.jour).toBe("2027-01-06"); // il est plus de 21 h le 6 janvier
  });
});
