import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LigneRef } from "../analyses/modele";
import { jourParJour } from "../analyses/periodes";
import {
  AKWA,
  AUJOURDHUI,
  BAFOUSSAM,
  BUS_207,
  BUS_330,
  BUS_412,
  COMPAGNIE,
  ESSONO,
  JOSEPH,
  MVAN,
  cadence,
  ecart,
  genererLigne,
} from "../analyses/testing/montage";
import { decalerJour } from "../rapport/temps";
import { ModeleScenario, PATRON, monterAssistant, type MontageAssistant } from "./testing/montage";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

/** Une grosse agence : 8 lignes, 20 départs par ligne et par jour, 60 jours (9 600 départs). */
function grosseAgence(modele?: ModeleScenario): MontageAssistant {
  const m = monterAssistant(modele ? { modele } : {});
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
  it("insights, question, simulation et conversation tiennent dans le budget, avec le modèle de langage", async () => {
    const modele = new ModeleScenario();
    modele.attenteMs = 600;
    const m = grosseAgence(modele);
    const t0 = performance.now();
    const insights = await m.assistant.insights(COMPAGNIE);
    const reponse = await m.assistant.poserQuestion(
      PATRON,
      COMPAGNIE,
      "Pourquoi Ville 3 → Ville 4 baisse ?",
    );
    const prevision = await m.assistant.poserQuestion(
      PATRON,
      COMPAGNIE,
      "Combien je vais encaisser lundi ?",
    );
    const departs = await m.departs.entre(
      COMPAGNIE,
      decalerJour(AUJOURDHUI, -3),
      decalerJour(AUJOURDHUI, -1),
    );
    const depart = departs[departs.length - 1]!;
    await m.assistant.simuler(COMPAGNIE, {
      type: "prix",
      departId: depart.departId,
      nouveauPrix: 3_000,
    });
    const conversation = await m.assistant.conversation(COMPAGNIE, PATRON.id);
    const ms = performance.now() - t0;

    expect(insights.fuites.length).toBeGreaterThan(0);
    expect(reponse.resume.length).toBeGreaterThan(0);
    expect(prevision.resume.length).toBeGreaterThan(0);
    expect(conversation.echanges).toHaveLength(2);
    expect(modele.demandes.length).toBeGreaterThan(0);
    // Le budget est de 5 s pour tout, y compris l'appel au modèle (ici 600 ms par question).
    expect(ms).toBeLessThan(5_000);
  });

  it("chaque réponse lit les départs une seule fois (pas de requête par ligne)", async () => {
    const m = grosseAgence();
    m.departs.lectures = 0;
    await m.assistant.insights(COMPAGNIE);
    expect(m.departs.lectures).toBe(1);
    m.departs.lectures = 0;
    await m.assistant.poserQuestion(PATRON, COMPAGNIE, "Où part mon argent ?");
    expect(m.departs.lectures).toBe(1);
  });
});
