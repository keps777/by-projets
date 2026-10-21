import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUJOURDHUI,
  AUTRE_COMPAGNIE,
  BUS_207,
  BUS_330,
  BUS_412,
  COMPAGNIE,
  DLA_BAF,
  DLA_YDE,
  depart,
  monterAnalyses,
  peuplerPlanche,
  peuplerReferentiel,
} from "./testing/montage";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

/** Mardi 5 janvier 2027 : la semaine du 29 déc. au 4 janv., la précédente du 22 au 28 déc. */
const SEMAINE = "2027-01-03";
const AVANT = "2026-12-24";

function montage() {
  const m = monterAnalyses();
  peuplerReferentiel(m);
  return m;
}

describe("synthèse : recette, lignes, colis", () => {
  it("la recette totale est la somme des lignes et des colis, au franc près", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({
        ligneId: DLA_BAF.id,
        jour: SEMAINE,
        billets: 20,
        prix: 3_500,
        colis: 5,
        recetteColis: 10_000,
      }),
      depart({ ligneId: DLA_BAF.id, jour: SEMAINE, heure: "13:00", billets: 10, prix: 3_500 }),
      depart({
        ligneId: DLA_YDE.id,
        jour: "2027-01-04",
        billets: 10,
        prix: 4_000,
        colis: 2,
        recetteColis: 4_000,
      }),
    );
    const s = await m.service.synthese(COMPAGNIE, "semaine");
    expect(s.lignes).toEqual([
      expect.objectContaining({ ligneId: DLA_BAF.id, recette: 105_000 }),
      expect.objectContaining({ ligneId: DLA_YDE.id, recette: 40_000 }),
    ]);
    expect(s.colis).toEqual({ nombre: 7, recette: 14_000 });
    expect(s.recette.total).toBe(105_000 + 40_000 + 14_000);
    expect(s.recette.total).toBe(s.lignes.reduce((t, l) => t + l.recette, 0) + s.colis.recette);
  });

  it("la série couvre la période : sa somme est exactement le total, jour par jour", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: "2026-12-29", billets: 10 }), // mardi
      depart({ jour: "2027-01-01", billets: 20 }), // vendredi
      depart({ jour: "2027-01-04", billets: 30 }), // lundi
    );
    const s = await m.service.synthese(COMPAGNIE, "semaine");
    expect(s.recette.serie.map((p) => p.libelle)).toEqual(["M", "M", "J", "V", "S", "D", "L"]);
    expect(s.recette.serie.map((p) => p.recette)).toEqual([35_000, 0, 0, 70_000, 0, 0, 105_000]);
    expect(s.recette.serie.reduce((t, p) => t + p.recette, 0)).toBe(s.recette.total);
  });

  it("ignore le jour entamé, la veille de la période, les départs annulés et les autres compagnies", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: SEMAINE, billets: 10 }),
      depart({ jour: AUJOURDHUI, billets: 40 }), // aujourd'hui : pas fini
      depart({ jour: "2026-12-28", billets: 99 }), // semaine d'avant
      depart({ jour: SEMAINE, billets: 0, recetteBillets: 0, annule: true }),
    );
    m.departs.ajouter(AUTRE_COMPAGNIE, depart({ jour: SEMAINE, billets: 500 }));
    const s = await m.service.synthese(COMPAGNIE, "semaine");
    expect(s.recette.total).toBe(35_000);
    expect(s.bus[0]!.trajets).toBe(1);
  });

  it("la variation compare à la période d'avant, de même longueur (0 quand elle est vide)", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: SEMAINE, billets: 21 }), // 73 500
      depart({ jour: AVANT, billets: 20 }), // 70 000
    );
    expect((await m.service.synthese(COMPAGNIE, "semaine")).recette.variationPct).toBe(5);

    const vide = montage();
    vide.departs.ajouter(COMPAGNIE, depart({ jour: SEMAINE, billets: 21 }));
    expect((await vide.service.synthese(COMPAGNIE, "semaine")).recette.variationPct).toBe(0);
  });

  it("une baisse est une variation négative", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: SEMAINE, billets: 12 }), // 42 000
      depart({ jour: AVANT, billets: 20 }), // 70 000
    );
    expect((await m.service.synthese(COMPAGNIE, "semaine")).recette.variationPct).toBe(-40);
  });

  it("le remplissage est pondéré par les places : billets vendus / places offertes", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: SEMAINE, capacite: 40, billets: 40 }),
      depart({ jour: SEMAINE, heure: "10:00", capacite: 10, billets: 0 }),
    );
    const s = await m.service.synthese(COMPAGNIE, "semaine");
    expect(s.lignes[0]!.remplissagePct).toBe(80); // 40 / 50, pas (100 + 0) / 2
  });

  it("une journée sans vente donne des zéros, pas une erreur", async () => {
    const s = await montage().service.synthese(COMPAGNIE, "semaine");
    expect(s).toMatchObject({
      nbGares: 3,
      recette: { total: 0, variationPct: 0, lecture: "Aucune vente sur la période." },
      lignes: [],
      bus: [],
      colis: { nombre: 0, recette: 0 },
    });
    expect(s.recette.serie).toHaveLength(7);
  });

  it("la lecture de la semaine cite les deux plus gros jours et le creux", async () => {
    const m = montage();
    peuplerPlanche(m);
    const s = await m.service.synthese(COMPAGNIE, "semaine");
    expect(s.recette.lecture).toMatch(/^\w+ et \w+ font \d+ % de la semaine\./);
    expect(s.recette.lecture).toContain("Le creux du mercredi est le plus profond à Bafoussam.");
  });

  it.each(["mois", "trimestre", "annee"] as const)(
    "la période « %s » : la série somme au total et le libellé nomme la période",
    async (periode) => {
      const m = montage();
      peuplerPlanche(m);
      const s = await m.service.synthese(COMPAGNIE, periode);
      expect(s.periode).toBe(periode);
      expect(s.recette.serie.reduce((t, p) => t + p.recette, 0)).toBe(s.recette.total);
      expect(s.recette.total).toBeGreaterThan(0);
    },
  );
});

describe("synthèse : par bus", () => {
  it("le net d'un bus est sa recette moins ses dépenses, les bus sont classés du meilleur au moins bon", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({
        jour: SEMAINE,
        busId: BUS_330.id,
        billets: 20,
        carburant: 30_000,
        autresDepenses: 5_000,
      }),
      depart({
        jour: SEMAINE,
        busId: BUS_207.id,
        billets: 20,
        carburant: 30_000,
        coutPanne: 100_000,
      }),
      depart({ jour: SEMAINE, busId: BUS_207.id, heure: "10:00", billets: 10, carburant: 30_000 }),
    );
    const s = await m.service.synthese(COMPAGNIE, "semaine");
    expect(s.bus.map((b) => [b.immatriculation, b.trajets, b.net])).toEqual([
      ["LT 330 AB", 1, 70_000 - 35_000],
      ["LT 207 AB", 2, 70_000 - 130_000 + 35_000 - 30_000],
    ]);
    expect(s.bus[0]!.chauffeur).toBe("Essomba");
  });

  it("le champ incident : pannes, retards longs, hausse du carburant, entretien, sinon « 0 incident »", async () => {
    const m = montage();
    const panne = { nature: "panne" as const, description: "embrayage", dureeMinutes: 130 };
    m.departs.ajouter(
      COMPAGNIE,
      // LT 207 : deux pannes
      depart({ jour: SEMAINE, busId: BUS_207.id, incident: panne, coutPanne: 300_000 }),
      depart({ jour: "2027-01-04", busId: BUS_207.id, incident: panne }),
      // LT 330 : un retard de 45 minutes
      depart({ jour: SEMAINE, busId: BUS_330.id, retardMinutes: 45 }),
      // LT 412 : rien, mais un entretien à prévoir
      depart({ jour: SEMAINE, busId: BUS_412.id }),
    );
    const s = await m.service.synthese(COMPAGNIE, "semaine");
    const incident = (id: string) => s.bus.find((b) => b.busId === id)!.incident;
    expect(incident(BUS_207.id)).toBe("2 pannes");
    expect(incident(BUS_330.id)).toBe("1 retard > 30 min");
    expect(incident(BUS_412.id)).toBe("pneus à changer");
  });

  it("carburant + 12 % : la consommation par trajet monte de plus de 10 % sur la période d'avant", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: SEMAINE, busId: BUS_330.id, carburant: 33_600 }),
      depart({ jour: AVANT, busId: BUS_330.id, carburant: 30_000 }),
    );
    expect((await m.service.synthese(COMPAGNIE, "semaine")).bus[0]!.incident).toBe(
      "carburant + 12 %",
    );

    const stable = montage();
    stable.departs.ajouter(
      COMPAGNIE,
      depart({ jour: SEMAINE, busId: BUS_330.id, carburant: 31_000 }),
      depart({ jour: AVANT, busId: BUS_330.id, carburant: 30_000 }),
    );
    expect((await stable.service.synthese(COMPAGNIE, "semaine")).bus[0]!.incident).toBe(
      "0 incident",
    );
  });
});

describe("analyse d'une ligne", () => {
  it("un départ par série (heure, classe) avec son remplissage moyen, son prix, son bus et sa note", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({
        jour: "2027-01-03",
        heure: "06:00",
        capacite: 40,
        billets: 40,
        note: "soute colis",
      }),
      depart({ jour: "2027-01-04", heure: "06:00", capacite: 40, billets: 36 }),
      depart({
        jour: "2027-01-04",
        heure: "16:30",
        classe: "vip",
        prix: 5_000,
        capacite: 40,
        billets: 30,
      }),
    );
    const l = await m.service.ligne(COMPAGNIE, DLA_BAF.id);
    expect(
      l.departs.map((d) => [d.heure, d.classe, d.prix, d.remplissagePct, d.bus, d.note]),
    ).toEqual([
      ["06:00", "classique", 3_500, 95, "LT 330 AB", "soute colis"],
      ["16:30", "vip", 5_000, 75, "LT 330 AB", null],
    ]);
    expect(l.billets).toEqual({ nombre: 106, departs: 3 });
    expect(l.remplissage.cible).toBe(85);
  });

  it("par jour de la semaine : la série part du lundi et chaque barre est la recette de ce jour", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: "2027-01-04", billets: 10 }), // lundi
      depart({ jour: "2026-12-30", billets: 30 }), // mercredi
    );
    const l = await m.service.ligne(COMPAGNIE, DLA_BAF.id);
    expect(l.parJour.serie.map((p) => p.libelle)).toEqual(["L", "M", "M", "J", "V", "S", "D"]);
    expect(l.parJour.serie.map((p) => p.recette)).toEqual([35_000, 0, 105_000, 0, 0, 0, 0]);
    expect(l.parJour.lecture).toMatch(/^Le mercredi est le plus fort/);
  });

  it("vendus en ligne, en route et variation en points", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({
        jour: SEMAINE,
        billets: 100,
        billetsEnLigne: 11,
        billetsEnRoute: 96,
        arretsEnRoute: ["Bafang", "Mbouda"],
        enRouteTousEnregistres: true,
      }),
      depart({ jour: AVANT, billets: 100, billetsEnLigne: 8 }),
    );
    const l = await m.service.ligne(COMPAGNIE, DLA_BAF.id);
    expect(l.canaux.enLigne).toEqual({ partPct: 11, billets: 11, variationPts: 3 });
    expect(l.canaux.enRoute).toEqual({
      billets: 96,
      arrets: ["Bafang", "Mbouda"],
      tousEnregistres: true,
    });
  });

  it("en route : tousEnregistres est faux dès qu'un départ a des ventes à enregistrer", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: SEMAINE, billetsEnRoute: 10, enRouteTousEnregistres: true }),
      depart({ jour: "2027-01-04", billetsEnRoute: 5, enRouteTousEnregistres: false }),
    );
    expect((await m.service.ligne(COMPAGNIE, DLA_BAF.id)).canaux.enRoute.tousEnregistres).toBe(
      false,
    );
  });

  it("le concurrent moins cher et proche apparaît sur le départ concerné, avec son nom public", async () => {
    const m = montage();
    peuplerPlanche(m);
    const l = await m.service.ligne(COMPAGNIE, DLA_BAF.id);
    const dix = l.departs.find((d) => d.heure === "10:00")!;
    expect(dix.concurrent).toEqual({ compagnie: "Oméga", heure: "09:30", prix: 3_000 });
    expect(l.departs.filter((d) => d.concurrent !== null)).toHaveLength(1);
  });

  it("une ligne d'une autre compagnie est inconnue (404), même si l'identifiant existe ailleurs", async () => {
    const m = montage();
    m.referentiel.ajouterLigne(AUTRE_COMPAGNIE, { ...DLA_BAF, id: "ligne-secrete" });
    await expect(m.service.ligne(COMPAGNIE, "ligne-secrete")).rejects.toMatchObject({
      status: 404,
      response: { code: "LIGNE_INCONNUE" },
    });
  });
});

describe("analyse d'un bus", () => {
  it("trajet par trajet : passagers, recette, retard, incident et net (recette moins dépenses)", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({
        jour: "2027-01-04",
        heure: "06:00",
        busId: BUS_207.id,
        capacite: 30,
        billets: 28,
        prix: 3_500,
        carburant: 37_000,
        retardMinutes: 0,
      }),
      depart({
        jour: "2026-12-29",
        heure: "06:00",
        busId: BUS_207.id,
        billets: 30,
        recetteBillets: 0,
        carburant: 10_000,
        coutPanne: 300_000,
        incident: { nature: "panne", description: "panne embrayage à Mbouda", dureeMinutes: 130 },
      }),
    );
    const b = await m.service.bus(COMPAGNIE, BUS_207.id);
    expect(b.trajets.map((t) => t.jour)).toEqual(["mar", "lun"]);
    expect(b.trajets[1]).toMatchObject({
      origine: "Douala",
      destination: "Bafoussam",
      passagers: { remplis: 28, capacite: 30 },
      recette: 98_000,
      retardMinutes: 0,
      incident: null,
      net: 98_000 - 37_000,
    });
    expect(b.trajets[0]).toMatchObject({
      recette: null,
      incident: { nature: "panne", dureeMinutes: 130 },
      net: -310_000,
    });
    expect(b.net).toBe(98_000 - 37_000 - 310_000);
    expect(b.depenses).toEqual({ total: 347_000, carburant: 47_000, pannes: 300_000 });
  });

  it("deux pannes en 10 jours : le bus est à surveiller et l'avis dit quoi faire", async () => {
    const m = montage();
    const panne = { nature: "panne" as const, description: "panne", dureeMinutes: 60 };
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: "2026-12-29", busId: BUS_207.id, incident: panne, coutPanne: 200_000 }),
      depart({ jour: "2027-01-02", busId: BUS_207.id, incident: panne, coutPanne: 100_000 }),
      depart({ jour: "2027-01-03", busId: BUS_330.id, billets: 30 }),
    );
    const b = await m.service.bus(COMPAGNIE, BUS_207.id);
    expect(b.statut).toBe("a_surveiller");
    expect(b.avisAssistant).toContain("2 pannes en 10 jours sur le même bus");
    expect(b.avisAssistant).toContain("300 000 F");
    expect(b.avisAssistant).toContain("LT 330 AB");
  });

  it("une seule panne, ou deux pannes à plus de 10 jours d'écart : le bus reste « ok »", async () => {
    const m = montage();
    const panne = { nature: "panne" as const, description: "panne", dureeMinutes: 60 };
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: "2026-12-10", busId: BUS_207.id, incident: panne }),
      depart({ jour: "2027-01-03", busId: BUS_207.id, incident: panne }),
    );
    expect((await m.service.bus(COMPAGNIE, BUS_207.id)).statut).toBe("ok");
  });

  it("net par semaine : huit semaines, et la tendance depuis la première panne", async () => {
    const m = montage();
    // Cinq semaines stables (nets 70 000 − 30 000 = 40 000), puis la panne du 21 déc. et deux semaines faibles.
    m.departs.ajouter(
      COMPAGNIE,
      depart({ busId: BUS_207.id, jour: "2026-11-12", billets: 20 }),
      depart({ busId: BUS_207.id, jour: "2026-11-19", billets: 20 }),
      depart({ busId: BUS_207.id, jour: "2026-11-26", billets: 20 }),
      depart({ busId: BUS_207.id, jour: "2026-12-03", billets: 20 }),
      depart({ busId: BUS_207.id, jour: "2026-12-10", billets: 20 }),
      depart({ busId: BUS_207.id, jour: "2026-12-17", billets: 20 }),
      depart({
        busId: BUS_207.id,
        jour: "2026-12-24",
        billets: 0,
        recetteBillets: 0,
        coutPanne: 280_000,
        incident: { nature: "panne", description: "panne", dureeMinutes: 100 },
      }),
      depart({ busId: BUS_207.id, jour: "2027-01-03", billets: 0, recetteBillets: 0 }),
    );
    const b = await m.service.bus(COMPAGNIE, BUS_207.id);
    expect(b.netParSemaine.serie).toHaveLength(8);
    expect(b.netParSemaine.serie.map((p) => p.libelle)).toEqual([
      "S47",
      "S48",
      "S49",
      "S50",
      "S51",
      "S52",
      "S53",
      "S1",
    ]);
    expect(b.netParSemaine.depuis).toBe("panne du 24 déc.");
    expect(b.netParSemaine.variationPct).toBeLessThan(-100);
    expect(b.netParSemaine.serie[0]!.net).toBe(40_000);
  });

  it("net moyen de la flotte : la moyenne des nets des bus qui ont roulé cette semaine", async () => {
    const m = montage();
    m.departs.ajouter(
      COMPAGNIE,
      depart({ jour: SEMAINE, busId: BUS_207.id, billets: 20, carburant: 30_000 }), // 40 000
      depart({ jour: SEMAINE, busId: BUS_330.id, billets: 30, carburant: 30_000 }), // 75 000
    );
    const b = await m.service.bus(COMPAGNIE, BUS_207.id);
    expect(b.netMoyenFlotte).toBe(57_500);
  });

  it("un bus inconnu ou d'une autre compagnie : 404", async () => {
    const m = montage();
    await expect(m.service.bus(COMPAGNIE, "bus-fantome")).rejects.toMatchObject({
      status: 404,
      response: { code: "BUS_INCONNU" },
    });
  });
});

describe("sources en panne", () => {
  it("sans les départs, la réponse est 503 : on ne montre pas des zéros pour des chiffres inconnus", async () => {
    const m = montage();
    m.departs.enPanne = true;
    await expect(m.service.synthese(COMPAGNIE, "semaine")).rejects.toMatchObject({
      status: 503,
      response: { code: "SOURCE_INDISPONIBLE" },
    });
  });

  it("sans les offres des autres compagnies, la ligne est servie sans concurrent", async () => {
    const m = montage();
    peuplerPlanche(m);
    m.offres.enPanne = true;
    const l = await m.service.ligne(COMPAGNIE, DLA_BAF.id);
    expect(l.departs.every((d) => d.concurrent === null)).toBe(true);
  });
});
