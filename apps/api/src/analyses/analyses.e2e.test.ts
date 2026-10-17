import type { AddressInfo } from "node:net";
import { patron } from "@afrimove/contrats";
import { Logger } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { creerAppAnalysesTest, type AppAnalysesTest } from "./testing/app-analyses-test";
import {
  AUTRE_COMPAGNIE,
  BUS_207,
  BUS_330,
  COMPAGNIE,
  DLA_BAF,
  depart,
  peuplerPlanche,
} from "./testing/montage";

let t: AppAnalysesTest;
let patronAlpha: { id: string; jeton: string };
let patronBeta: { id: string; jeton: string };
let patronSansCompagnie: { id: string; jeton: string };
const autres: Record<string, { jeton: string }> = {};

beforeAll(async () => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
  t = await creerAppAnalysesTest();
  peuplerPlanche(t.montage);
  t.montage.departs.ajouter(
    COMPAGNIE,
    depart({
      jour: "2026-12-29",
      busId: BUS_207.id,
      incident: { nature: "panne", description: "embrayage", dureeMinutes: 130 },
      coutPanne: 300_000,
    }),
    depart({
      jour: "2027-01-02",
      busId: BUS_207.id,
      incident: { nature: "panne", description: "batterie", dureeMinutes: 40 },
      coutPanne: 45_000,
    }),
  );
  patronAlpha = await t.compte("patron");
  patronBeta = await t.compte("patron", { compagnieId: AUTRE_COMPAGNIE });
  patronSansCompagnie = await t.compte("patron", { compagnieId: null });
  for (const role of ["comptable", "superviseur", "guichetier", "voyageur", "afrimove"] as const) {
    autres[role] = await t.compte(role, {
      compagnieId: role === "voyageur" || role === "afrimove" ? null : COMPAGNIE,
    });
  }
});
afterAll(() => t.fermer());
beforeEach(() => {
  t.montage.departs.enPanne = false;
});

const avec = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });
const get = (chemin: string, jeton = patronAlpha.jeton) => t.http().get(chemin).set(avec(jeton));

describe("accès", () => {
  it("exige un jeton", async () => {
    for (const chemin of [
      "/patron/analyses",
      `/patron/analyses/lignes/${DLA_BAF.id}`,
      `/patron/analyses/bus/${BUS_207.id}`,
    ]) {
      await t.http().get(chemin).expect(401);
    }
  });

  it("est réservé au patron : tous les autres rôles reçoivent 403, et le refus est tracé", async () => {
    for (const chemin of [
      "/patron/analyses",
      `/patron/analyses/lignes/${DLA_BAF.id}`,
      `/patron/analyses/bus/${BUS_207.id}`,
    ]) {
      for (const r of Object.values(autres)) await get(chemin, r.jeton).expect(403);
    }
    expect(
      t.auditRepo.lignes.filter((l) => l.action === "acces.refuse").length,
    ).toBeGreaterThanOrEqual(15);
  });

  it("refuse un patron sans compagnie", async () => {
    const r = await get("/patron/analyses", patronSansCompagnie.jeton).expect(403);
    expect(r.body).toMatchObject({ code: "HORS_PERIMETRE" });
  });

  it("chaque patron ne lit que les chiffres de sa compagnie", async () => {
    const beta = await get("/patron/analyses?periode=semaine", patronBeta.jeton).expect(200);
    expect(beta.body.recette.total).toBe(0);
    expect(beta.body.lignes).toEqual([]);
    await get(`/patron/analyses/lignes/${DLA_BAF.id}`, patronBeta.jeton).expect(404);
    await get(`/patron/analyses/bus/${BUS_207.id}`, patronBeta.jeton).expect(404);
    const alpha = await get("/patron/analyses?periode=semaine").expect(200);
    expect(alpha.body.recette.total).toBeGreaterThan(0);
  });
});

describe("GET /patron/analyses", () => {
  it("rend la synthèse conforme au contrat Analyses, pour chaque période, sans cache", async () => {
    for (const periode of ["semaine", "mois", "trimestre", "annee"]) {
      const r = await get(`/patron/analyses?periode=${periode}`).expect(200);
      const lu = patron.AnalysesSchema.parse(r.body);
      expect(lu.periode).toBe(periode);
      expect(r.headers["cache-control"]).toBe("no-store");
    }
    const defaut = await get("/patron/analyses").expect(200);
    expect(defaut.body.periode).toBe("semaine");
    expect(defaut.body.libelle).toBe("Semaine du 29 déc. au 4 janv.");
  });

  it("refuse une période inconnue ou un paramètre inconnu (400)", async () => {
    const r = await get("/patron/analyses?periode=siecle").expect(400);
    expect(r.body).toMatchObject({ code: "REQUETE_INVALIDE" });
    await get("/patron/analyses?compagnieId=x").expect(400);
    await get("/patron/analyses?periode=semaine&periode=mois").expect(400);
  });

  it("répond 503 quand les départs sont indisponibles, sans inventer de chiffres", async () => {
    t.montage.departs.enPanne = true;
    const r = await get("/patron/analyses").expect(503);
    expect(r.body).toMatchObject({ code: "SOURCE_INDISPONIBLE" });
  });
});

describe("GET /patron/analyses/lignes/:ligneId", () => {
  it("rend l'analyse conforme au contrat AnalyseLigne, avec la période en option", async () => {
    const r = await get(`/patron/analyses/lignes/${DLA_BAF.id}`).expect(200);
    const lu = patron.AnalyseLigneSchema.parse(r.body);
    expect(lu.ligne).toEqual({ id: DLA_BAF.id, nom: "Douala → Bafoussam" });
    expect(lu.departs.find((d) => d.heure === "10:00")?.concurrent?.compagnie).toBe("Oméga");
    const mois = await get(`/patron/analyses/lignes/${DLA_BAF.id}?periode=mois`).expect(200);
    expect(patron.AnalyseLigneSchema.parse(mois.body).periode).toBe("mois");
  });

  it("404 LIGNE_INCONNUE pour une ligne inconnue", async () => {
    const r = await get("/patron/analyses/lignes/ligne-fantome").expect(404);
    expect(r.body).toMatchObject({ code: "LIGNE_INCONNUE" });
  });
});

describe("GET /patron/analyses/bus/:busId", () => {
  it("rend l'analyse conforme au contrat AnalyseBus : deux pannes, bus à surveiller", async () => {
    const r = await get(`/patron/analyses/bus/${BUS_207.id}`).expect(200);
    const lu = patron.AnalyseBusSchema.parse(r.body);
    expect(lu.statut).toBe("a_surveiller");
    expect(lu.trajets.filter((x) => x.incident?.nature === "panne")).toHaveLength(2);
    expect(lu.avisAssistant).toContain("2 pannes");
    const ok = await get(`/patron/analyses/bus/${BUS_330.id}`).expect(200);
    expect(patron.AnalyseBusSchema.parse(ok.body).statut).toBe("ok");
  });

  it("404 BUS_INCONNU, et 400 si on ajoute un paramètre", async () => {
    const r = await get("/patron/analyses/bus/bus-fantome").expect(404);
    expect(r.body).toMatchObject({ code: "BUS_INCONNU" });
    await get(`/patron/analyses/bus/${BUS_207.id}?periode=mois`).expect(400);
  });
});

describe("avec le client d'API en mode HTTP (@afrimove/api-client)", () => {
  it("les trois opérations patron.analyses.* fonctionnent sur le serveur, réponses validées par les schémas du contrat", async () => {
    const { OP_ANALYSES, OP_ANALYSE_LIGNE, OP_ANALYSE_BUS } = await import(
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

    expect(OP_ANALYSES.chemin({ periode: "semaine" })).toBe("/patron/analyses");
    expect(OP_ANALYSE_LIGNE.chemin({ ligneId: DLA_BAF.id })).toBe(
      `/patron/analyses/lignes/${DLA_BAF.id}`,
    );
    expect(OP_ANALYSE_BUS.chemin({ busId: BUS_207.id })).toBe(`/patron/analyses/bus/${BUS_207.id}`);

    const synthese = await client.executer(OP_ANALYSES, { periode: "semaine" });
    expect(synthese.libelle).toBe("Semaine du 29 déc. au 4 janv.");
    const ligne = await client.executer(OP_ANALYSE_LIGNE, { ligneId: DLA_BAF.id });
    expect(ligne.ligne.id).toBe(DLA_BAF.id);
    const moisLigne = await client.executer(OP_ANALYSE_LIGNE, {
      ligneId: DLA_BAF.id,
      periode: "mois",
    });
    expect(moisLigne.periode).toBe("mois");
    const bus = await client.executer(OP_ANALYSE_BUS, { busId: BUS_207.id });
    expect(bus.statut).toBe("a_surveiller");
  });
});
