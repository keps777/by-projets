import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigAnalysesInvalide, chargerConfigAnalyses } from "./config";
import { ReseauMemoire } from "./memoire";
import type { AgregatReseau, OffrePublique } from "./modele";
import { jourParJour } from "./periodes";
import { OffresPubliques, ReseauAnonyme } from "./ports";
import { SEUIL_ANONYMAT } from "./regles";
import {
  AUTRE_COMPAGNIE,
  CINQUIEME,
  COMPAGNIE,
  DLA_BAF,
  QUATRIEME,
  TROISIEME,
  depart,
  monterAnalyses,
  peuplerPlanche,
} from "./testing/montage";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

const DU = "2026-12-06";
const AU = "2027-01-04";

function remplissages(compagnieId: string, pct: number, creneau = "09:00") {
  return jourParJour(DU, AU).map((jour) => ({
    compagnieId,
    ligneCode: "DLABAF",
    creneau,
    jour,
    remplissagePct: pct,
  }));
}

describe("moyennes du réseau : anonymes ou rien", () => {
  it("avec deux autres compagnies seulement, la moyenne désignerait l'une d'elles : rien ne sort", async () => {
    const reseau = new ReseauMemoire().ajouter(
      ...remplissages(AUTRE_COMPAGNIE, 40),
      ...remplissages(TROISIEME, 60),
    );
    expect(await reseau.moyennes(COMPAGNIE, ["DLABAF"], DU, AU, SEUIL_ANONYMAT)).toEqual([]);
  });

  it("avec trois compagnies, on obtient une moyenne et un nombre de compagnies, jamais un nom ni un identifiant", async () => {
    const reseau = new ReseauMemoire().ajouter(
      ...remplissages(AUTRE_COMPAGNIE, 40),
      ...remplissages(TROISIEME, 60),
      ...remplissages(QUATRIEME, 80),
    );
    const [moyenne] = await reseau.moyennes(COMPAGNIE, ["DLABAF"], DU, AU, SEUIL_ANONYMAT);
    expect(moyenne).toEqual({
      ligneCode: "DLABAF",
      creneau: "09:00",
      compagnies: 3,
      remplissageMoyenPct: 60,
      jours: 30,
    });
    const texte = JSON.stringify(moyenne);
    for (const id of [AUTRE_COMPAGNIE, TROISIEME, QUATRIEME]) expect(texte).not.toContain(id);
  });

  it("la compagnie qui demande n'est jamais comptée dans sa propre moyenne « du réseau »", async () => {
    const reseau = new ReseauMemoire().ajouter(
      ...remplissages(COMPAGNIE, 99),
      ...remplissages(AUTRE_COMPAGNIE, 40),
      ...remplissages(TROISIEME, 40),
    );
    expect(await reseau.moyennes(COMPAGNIE, ["DLABAF"], DU, AU, SEUIL_ANONYMAT)).toEqual([]);
  });

  it("le seuil ne descend jamais sous trois, même par la configuration", () => {
    expect(chargerConfigAnalyses({}).seuilAnonymat).toBe(3);
    expect(chargerConfigAnalyses({ ANALYSES_SEUIL_ANONYMAT: "5" }).seuilAnonymat).toBe(5);
    for (const seuil of ["2", "1", "0", "-1", "trois"]) {
      expect(() => chargerConfigAnalyses({ ANALYSES_SEUIL_ANONYMAT: seuil })).toThrow(
        ConfigAnalysesInvalide,
      );
    }
    expect(() => chargerConfigAnalyses({ ANALYSES_NOMMER_CONCURRENTS: "peut-être" })).toThrow(
      ConfigAnalysesInvalide,
    );
  });
});

describe("le service ne fait pas confiance à l'adaptateur", () => {
  it("une moyenne sous le seuil, ou sans nombre de compagnies, est écartée ; les champs en trop aussi", async () => {
    const m = monterAnalyses();
    peuplerPlanche(m);
    const indiscret = {
      durable: false,
      moyennes: async (): Promise<AgregatReseau[]> =>
        [
          {
            ligneCode: "DLABAF",
            creneau: "09:00",
            compagnies: 1,
            remplissageMoyenPct: 41,
            jours: 30,
          },
          {
            ligneCode: "DLABAF",
            creneau: "10:00",
            compagnies: 2,
            remplissageMoyenPct: 52,
            jours: 30,
          },
          {
            ligneCode: "DLABAF",
            creneau: "11:00",
            compagnies: 3,
            remplissageMoyenPct: 63,
            jours: 30,
            compagnieId: "secret-omega",
            nom: "Oméga",
          },
        ] as AgregatReseau[],
    } satisfies ReseauAnonyme;
    const service = new (m.service.constructor as new (...a: unknown[]) => typeof m.service)(
      m.referentiel,
      m.departs,
      m.caisse,
      m.offres,
      indiscret,
      m.horloge,
      m.config,
    );
    const { reseau } = await service.contexte(COMPAGNIE);
    expect(reseau).toEqual([
      { ligneCode: "DLABAF", creneau: "11:00", compagnies: 3, remplissageMoyenPct: 63, jours: 30 },
    ]);
    expect(JSON.stringify(reseau)).not.toContain("secret-omega");
  });

  it("une offre publique ne porte que ses cinq champs publics : une vente glissée par l'adaptateur n'en sort pas", async () => {
    const m = monterAnalyses();
    peuplerPlanche(m);
    const indiscret = {
      durable: false,
      entre: async (): Promise<OffrePublique[]> =>
        [
          {
            compagnie: "Oméga",
            ligneCode: "DLABAF",
            jour: "2027-01-03",
            heure: "09:30",
            prix: 3_000,
            billetsVendus: 38,
            recette: 114_000,
            compagnieId: "secret-omega",
          },
        ] as unknown as OffrePublique[],
    } satisfies OffresPubliques;
    const service = new (m.service.constructor as new (...a: unknown[]) => typeof m.service)(
      m.referentiel,
      m.departs,
      m.caisse,
      indiscret,
      m.reseau,
      m.horloge,
      m.config,
    );
    const { offres } = await service.contexte(COMPAGNIE);
    expect(offres).toEqual([
      { compagnie: "Oméga", ligneCode: "DLABAF", jour: "2027-01-03", heure: "09:30", prix: 3_000 },
    ]);
  });
});

describe("rien d'une autre compagnie ne sort, hors son horaire et son prix publics", () => {
  /** Une autre compagnie vend très bien sur la même ligne, et trois autres alimentent le réseau. */
  function monter() {
    const m = monterAnalyses();
    peuplerPlanche(m);
    m.departs.ajouter(
      AUTRE_COMPAGNIE,
      depart({ ligneId: DLA_BAF.id, jour: "2027-01-03", billets: 777, recetteBillets: 7_770_777 }),
    );
    m.reseau.ajouter(
      ...remplissages(AUTRE_COMPAGNIE, 42.5),
      ...remplissages(TROISIEME, 60),
      ...remplissages(QUATRIEME, 80),
      ...remplissages(CINQUIEME, 70),
    );
    m.offres.publier(TROISIEME, {
      compagnie: "Zeta Express",
      ligneCode: "DLABAF",
      jour: "2027-01-03",
      heure: "09:45",
      prix: 2_900,
    });
    return m;
  }

  it("ni leurs billets, ni leurs recettes, ni leurs identifiants dans les trois écrans ni dans les constats", async () => {
    const m = monter();
    const { constats } = await m.service.constats(COMPAGNIE);
    const tout = JSON.stringify([
      await m.service.synthese(COMPAGNIE, "semaine"),
      await m.service.synthese(COMPAGNIE, "mois"),
      await m.service.ligne(COMPAGNIE, DLA_BAF.id),
      constats,
    ]);
    for (const secret of ["7770777", AUTRE_COMPAGNIE, TROISIEME, QUATRIEME, CINQUIEME]) {
      expect(tout).not.toContain(secret);
    }
  });

  it("la moyenne anonyme du réseau est citée comme telle, sans nom, quand elle sert", async () => {
    const m = monter();
    const { constats } = await m.service.constats(COMPAGNIE);
    const gain = constats.gains[0]!;
    expect(gain.sources.map((s) => s.type)).toContain("reseau_anonyme");
    expect(JSON.stringify(gain)).toContain("moyenne anonyme de 4 autres compagnies");
  });

  it("sous le seuil, la moyenne n'est ni utilisée ni citée", async () => {
    const m = monterAnalyses();
    peuplerPlanche(m);
    m.reseau.ajouter(...remplissages(AUTRE_COMPAGNIE, 42.5), ...remplissages(TROISIEME, 60));
    const { constats } = await m.service.constats(COMPAGNIE);
    expect(JSON.stringify(constats)).not.toContain("anonyme");
  });

  it("le nom d'un concurrent n'apparaît que par son horaire et son prix publics, et se retire par configuration", async () => {
    const nomme = await monter().service.ligne(COMPAGNIE, DLA_BAF.id);
    expect(JSON.stringify(nomme)).toContain("Oméga");

    const m = monterAnalyses({ ANALYSES_NOMMER_CONCURRENTS: "false" });
    peuplerPlanche(m);
    const { constats } = await m.service.constats(COMPAGNIE);
    const tout = JSON.stringify([await m.service.ligne(COMPAGNIE, DLA_BAF.id), constats]);
    expect(tout).not.toContain("Oméga");
    expect(tout).toContain("Une autre compagnie");
  });
});
