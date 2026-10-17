import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decalerJour } from "../rapport/temps";
import { jourParJour } from "./periodes";
import type { LigneRef } from "./modele";
import {
  AUJOURDHUI,
  COMPAGNIE,
  ESSONO,
  JOSEPH,
  AKWA,
  BAFOUSSAM,
  MVAN,
  BUS_207,
  BUS_330,
  BUS_412,
  cadence,
  ecart,
  genererLigne,
  monterAnalyses,
} from "./testing/montage";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

/** Une grosse agence : 8 lignes, 20 départs par ligne et par jour, 30 jours (4 800 départs). */
function grosseAgence() {
  const m = monterAnalyses();
  for (const g of [AKWA, MVAN, BAFOUSSAM]) m.referentiel.ajouterGare(COMPAGNIE, g);
  for (const b of [BUS_207, BUS_330, BUS_412]) m.referentiel.ajouterBus(COMPAGNIE, b);
  m.referentiel.ajouterAgent(COMPAGNIE, JOSEPH).ajouterAgent(COMPAGNIE, ESSONO);
  const du = decalerJour(AUJOURDHUI, -60);
  const au = decalerJour(AUJOURDHUI, -1);
  const lignes: LigneRef[] = Array.from({ length: 8 }, (_, i) => ({
    id: `ligne-${i}`,
    nom: `Ville ${i} → Ville ${i + 1}`,
    code: `V${i}V${i + 1}`,
    origine: `Ville ${i}`,
    destination: `Ville ${i + 1}`,
  }));
  const horaires = Array.from({ length: 20 }, (_, h) => ({
    heure: `${String(4 + h).padStart(2, "0")}:00`,
    remplissage: (j: number) => 40 + ((h * 7 + j * 11) % 55),
  }));
  for (const ligne of lignes) {
    m.referentiel.ajouterLigne(COMPAGNIE, ligne);
    m.departs.ajouter(COMPAGNIE, ...genererLigne(ligne, du, au, horaires));
    for (const jour of jourParJour(decalerJour(AUJOURDHUI, -30), au)) {
      m.offres.publier("autre", {
        compagnie: "Oméga",
        ligneCode: ligne.code,
        jour,
        heure: "09:30",
        prix: 3_000,
      });
    }
  }
  for (const jour of jourParJour(decalerJour(AUJOURDHUI, -30), au)) {
    for (let guichet = 1; guichet <= 12; guichet++) {
      m.caisse.ajouterEcart(
        COMPAGNIE,
        ecart({ jour, guichet: `Guichet ${guichet}`, ecart: -1_200 * (guichet % 3) }),
      );
      m.caisse.ajouterCadence(COMPAGNIE, cadence({ jour, sansNom: guichet % 4 }));
    }
  }
  return m;
}

describe("réponse en moins de 5 s sur 30 jours de données", () => {
  it("les trois écrans, les constats et une simulation tiennent dans le budget, avec une grande marge", async () => {
    const m = grosseAgence();
    const t0 = performance.now();
    const synthese = await m.service.synthese(COMPAGNIE, "semaine");
    const mois = await m.service.synthese(COMPAGNIE, "mois");
    const ligne = await m.service.ligne(COMPAGNIE, "ligne-3", "mois");
    const bus = await m.service.bus(COMPAGNIE, BUS_330.id);
    const { contexte, constats } = await m.service.constats(COMPAGNIE);
    const depart = contexte.departs[contexte.departs.length - 1]!;
    await m.service.simuler(COMPAGNIE, {
      type: "prix",
      departId: depart.departId,
      nouveauPrix: 3_000,
    });
    const ms = performance.now() - t0;

    expect(synthese.lignes).toHaveLength(8);
    expect(mois.bus.length).toBeGreaterThan(0);
    expect(ligne.departs).toHaveLength(20);
    expect(bus.netParSemaine.serie).toHaveLength(8);
    expect(constats.fuites.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(5_000);
    // Marge : le budget est de 5 s pour tout, y compris l'appel au modèle de langage.
    expect(ms).toBeLessThan(2_000);
  });

  it("chaque écran lit les ports une seule fois (pas de requête par ligne)", async () => {
    const m = grosseAgence();
    m.departs.lectures = 0;
    await m.service.synthese(COMPAGNIE, "semaine");
    expect(m.departs.lectures).toBe(1);
    m.departs.lectures = 0;
    await m.service.constats(COMPAGNIE);
    expect(m.departs.lectures).toBe(1);
  });

  it("l'année entière (728 jours lus avec la période d'avant) reste dans le budget", async () => {
    const m = grosseAgence();
    const t0 = performance.now();
    await m.service.synthese(COMPAGNIE, "annee");
    expect(performance.now() - t0).toBeLessThan(5_000);
  });
});
