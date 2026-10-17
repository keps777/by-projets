import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVANCE_SUR_CONCURRENT_MINUTES,
  ELASTICITE_PRIX,
  TAUX_RECUPERATION_DEVANCE,
  TAUX_RECUPERATION_SANS_AVANTAGE,
  heureDeMinutes,
  minutes,
} from "./simulation";
import {
  AUTRE_COMPAGNIE,
  COMPAGNIE,
  DLA_BAF,
  genererLigne,
  monterAnalyses,
  peuplerReferentiel,
} from "./testing/montage";
import { jourParJour } from "./periodes";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

const DU = "2026-12-06";
const AU = "2027-01-04";

/** Trois départs sur la ligne : 06:00 à 90 %, 10:00 à `pct10`, 14:00 à 90 % ; 40 places, 3 500 F. */
function monter(pct10 = 50, avecConcurrent = true) {
  const m = monterAnalyses();
  peuplerReferentiel(m);
  const faits = genererLigne(DLA_BAF, DU, AU, [
    { heure: "06:00", remplissage: () => 90 },
    { heure: "10:00", remplissage: () => pct10 },
    { heure: "14:00", remplissage: () => 90 },
  ]);
  m.departs.ajouter(COMPAGNIE, ...faits);
  if (avecConcurrent) {
    for (const jour of jourParJour(DU, AU)) {
      m.offres.publier(AUTRE_COMPAGNIE, {
        compagnie: "Oméga",
        ligneCode: "DLABAF",
        jour,
        heure: "09:30",
        prix: 3_000,
      });
    }
  }
  const dix = faits.filter((f) => f.heure === "10:00").at(-1)!;
  return { m, departId: dix.departId };
}

describe("simulation d'horaire", () => {
  it("devancer le concurrent récupère presque tous les voyageurs qui manquent, et le gain est mensuel", async () => {
    const { m, departId } = monter();
    const r = await m.service.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: "09:15",
    });
    // 10:00 : 20 voyageurs sur 40. Les autres départs : 36. Il en manque 16 ; 90 % sont récupérés.
    const attendu = Math.round(20 + 16 * TAUX_RECUPERATION_DEVANCE);
    expect(r.simulation.scenarios).toEqual([
      { libelle: "aujourd'hui", remplis: 20, capacite: 40 },
      { libelle: "à 09:15", remplis: attendu, capacite: 40 },
    ]);
    expect(r.simulation.gainMensuel).toBe((attendu - 20) * 3_500 * 30);
    expect(r.base).toContain("30 départs de ta ligne sur 30 jours");
    expect(r.base).toContain("l'horaire et le prix publics d'Oméga");
  });

  it("sans concurrent à devancer, déplacer un départ ne récupère presque rien", async () => {
    const { m, departId } = monter(50, false);
    const r = await m.service.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: "09:15",
    });
    expect(r.simulation.scenarios[1]!.remplis).toBe(
      Math.round(20 + 16 * TAUX_RECUPERATION_SANS_AVANTAGE),
    );
  });

  it("se placer APRÈS le concurrent ne le devance pas", async () => {
    const { m, departId } = monter();
    const avant = await m.service.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: "09:15",
    });
    const apres = await m.service.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: "09:45",
    });
    expect(apres.simulation.gainMensuel).toBeLessThan(avant.simulation.gainMensuel);
  });

  it("se placer pile au moment du concurrent ne le devance pas non plus : il faut au moins quinze minutes d'avance", async () => {
    const { m, departId } = monter();
    const juste = heureDeMinutes(minutes("09:30") - AVANCE_SUR_CONCURRENT_MINUTES);
    const tropJuste = heureDeMinutes(minutes("09:30") - AVANCE_SUR_CONCURRENT_MINUTES + 1);
    const a = await m.service.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: juste,
    });
    const b = await m.service.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: tropJuste,
    });
    expect(a.simulation.gainMensuel).toBeGreaterThan(b.simulation.gainMensuel);
  });

  it("le remplissage simulé ne dépasse jamais les places du bus", async () => {
    const { m, departId } = monter(0);
    const r = await m.service.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: "09:15",
    });
    expect(r.simulation.scenarios[1]!.remplis).toBeLessThanOrEqual(40);
    expect(r.simulation.scenarios[1]!.remplis).toBe(Math.round(0 + 36 * TAUX_RECUPERATION_DEVANCE));
  });

  it("un départ déjà plus rempli que les autres ne gagne rien : gain nul, jamais négatif", async () => {
    const { m, departId } = monter(100);
    const r = await m.service.simuler(COMPAGNIE, {
      type: "horaire",
      departId,
      nouvelleHeure: "09:15",
    });
    expect(r.simulation.gainMensuel).toBe(0);
    expect(r.simulation.scenarios[1]!.remplis).toBe(r.simulation.scenarios[0]!.remplis);
  });

  it("refuse un horaire à moins de trente minutes d'un autre départ de la ligne (422)", async () => {
    const { m, departId } = monter();
    await expect(
      m.service.simuler(COMPAGNIE, { type: "horaire", departId, nouvelleHeure: "06:20" }),
    ).rejects.toMatchObject({ status: 422, response: { code: "HORAIRE_EN_CONFLIT" } });
    // À exactement trente minutes, c'est permis.
    await expect(
      m.service.simuler(COMPAGNIE, { type: "horaire", departId, nouvelleHeure: "06:30" }),
    ).resolves.toBeDefined();
  });

  it("refuse de « déplacer » un départ à son heure actuelle (422)", async () => {
    const { m, departId } = monter();
    await expect(
      m.service.simuler(COMPAGNIE, { type: "horaire", departId, nouvelleHeure: "10:00" }),
    ).rejects.toMatchObject({ status: 422, response: { code: "SIMULATION_SANS_EFFET" } });
  });

  it("refuse de conclure sur moins de cinq départs (422), plutôt que d'inventer", async () => {
    const m = monterAnalyses();
    peuplerReferentiel(m);
    const faits = genererLigne(DLA_BAF, "2027-01-01", AU, [{ heure: "10:00" }]); // 4 jours
    m.departs.ajouter(COMPAGNIE, ...faits);
    await expect(
      m.service.simuler(COMPAGNIE, {
        type: "horaire",
        departId: faits[0]!.departId,
        nouvelleHeure: "09:15",
      }),
    ).rejects.toMatchObject({ status: 422, response: { code: "DONNEES_INSUFFISANTES" } });
  });

  it("un départ inconnu, ou d'une autre compagnie, est introuvable (404)", async () => {
    const { m } = monter();
    m.departs.ajouter(
      AUTRE_COMPAGNIE,
      ...genererLigne(DLA_BAF, DU, AU, [{ heure: "11:00" }]).slice(0, 1),
    );
    const autre = (await m.departs.entre(AUTRE_COMPAGNIE, DU, AU))[0]!;
    for (const departId of ["inconnu", autre.departId]) {
      await expect(
        m.service.simuler(COMPAGNIE, { type: "horaire", departId, nouvelleHeure: "09:15" }),
      ).rejects.toMatchObject({ status: 404, response: { code: "DEPART_INTROUVABLE" } });
    }
  });
});

describe("simulation de prix", () => {
  it("baisser le prix : des voyageurs en plus (élasticité), moins de recette, et combien il en faut pour s'y retrouver", async () => {
    const { m, departId } = monter(50, false);
    const r = await m.service.simuler(COMPAGNIE, { type: "prix", departId, nouveauPrix: 3_000 });
    const variation = (3_000 - 3_500) / 3_500;
    const apres = Math.round(20 * (1 + ELASTICITE_PRIX * variation));
    expect(r.simulation.scenarios).toEqual([
      { libelle: "aujourd'hui à 3 500 F", remplis: 20, capacite: 40 },
      { libelle: "à 3 000 F", remplis: apres, capacite: 40 },
    ]);
    expect(r.simulation.gainMensuel).toBe((apres * 3_000 - 20 * 3_500) * 30);
    expect(r.simulation.gainMensuel).toBeLessThan(0); // 23 × 3 000 < 20 × 3 500
    // Pour gagner la même chose : 20 × 3 500 / 3 000 = 23,33 → 24 voyageurs, soit 4 de plus.
    expect(r.simulation.passagersPourEquilibrer).toBe(Math.ceil(20 * (3_500 / 3_000 - 1)));
    expect(r.base).toContain("hypothèse");
  });

  it("monter le prix : moins de voyageurs, et pas de seuil d'équilibre", async () => {
    const { m, departId } = monter(50, false);
    const r = await m.service.simuler(COMPAGNIE, { type: "prix", departId, nouveauPrix: 4_000 });
    expect(r.simulation.scenarios[1]!.remplis).toBeLessThan(20);
    expect(r.simulation.passagersPourEquilibrer).toBeNull();
  });

  it("jamais plus de voyageurs que de places, ni moins que zéro", async () => {
    const { m, departId } = monter(100, false);
    const bas = await m.service.simuler(COMPAGNIE, { type: "prix", departId, nouveauPrix: 500 });
    expect(bas.simulation.scenarios[1]!.remplis).toBe(40);
    const haut = await m.service.simuler(COMPAGNIE, {
      type: "prix",
      departId,
      nouveauPrix: 100_000,
    });
    expect(haut.simulation.scenarios[1]!.remplis).toBe(0);
  });

  it("le même prix n'est pas une simulation (422)", async () => {
    const { m, departId } = monter();
    await expect(
      m.service.simuler(COMPAGNIE, { type: "prix", departId, nouveauPrix: 3_500 }),
    ).rejects.toMatchObject({ status: 422, response: { code: "SIMULATION_SANS_EFFET" } });
  });

  it("la simulation ne change rien : les faits lus restent identiques", async () => {
    const { m, departId } = monter();
    const avant = JSON.stringify(await m.departs.entre(COMPAGNIE, DU, AU));
    await m.service.simuler(COMPAGNIE, { type: "prix", departId, nouveauPrix: 3_000 });
    await m.service.simuler(COMPAGNIE, { type: "horaire", departId, nouvelleHeure: "09:15" });
    expect(JSON.stringify(await m.departs.entre(COMPAGNIE, DU, AU))).toBe(avant);
  });
});
