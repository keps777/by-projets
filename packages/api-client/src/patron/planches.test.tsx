// @vitest-environment jsdom
import { colis as contratsColis } from "@afrimove/contrats";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  ALPHA_AKWA,
  ALPHA_BAFOUSSAM,
  ALPHA_DLA_BAF,
  ALPHA_DLA_YDE,
  BUS_LT207,
  JOSEPH_M,
  NOMS_PLANCHES,
  ecrans,
} from "@afrimove/fixtures";
import { afterEach, describe, expect, it } from "vitest";
import {
  useAlertes,
  useAnalyseBus,
  useAnalyseLigne,
  useAnalyses,
  useApercuExport,
  useClotureMois,
  useConventionInterAgences,
  useConversationAssistant,
  useDossierFinancement,
  useEquipe,
  useFichierExport,
  useFichePersonne,
  useGare,
  useGares,
  useInsightsAssistant,
  useInterAgences,
  useLigneEditable,
  useModules,
  useOffreFinancement,
  usePersonneEditable,
  useRapportSoir,
  useRapprochementMomo,
  useRegles,
  useReglages,
  useSalleDeControle,
  useSyntheseComptable,
  useTableauDuJour,
} from "./hooks";
import { PLANCHES_PATRON } from "./installer";
import { ID_CONVENTION_OMEGA } from "./mock/interAgences";
import { clientPatron, enveloppe, lire, lireErreur } from "./mock/testing";

afterEach(cleanup);

/**
 * Un test par planche patron : dans le scénario qui porte son nom, les hooks dont l'écran a besoin
 * renvoient exactement les valeurs de la planche (montants en entiers de FCFA, heures ISO Douala).
 */

const a = (hhmm: string, jour = "2027-01-05"): string => `${jour}T${hhmm}:00.000+01:00`;

describe("le mock couvre toutes les planches patron", () => {
  it("25 planches : 24 écrans patron + la salle de contrôle", () => {
    expect(PLANCHES_PATRON).toHaveLength(25);
    for (const nom of PLANCHES_PATRON) expect(NOMS_PLANCHES).toContain(nom);
    const tickets = new Set(
      PLANCHES_PATRON.flatMap((nom) => ecrans[nom].route ?? []).filter((r) =>
        r.startsWith("/(patron)"),
      ),
    );
    expect(tickets.size).toBeGreaterThanOrEqual(20);
  });
});

describe("Patron · /(patron)/aujourdhui", () => {
  it("useTableauDuJour : les chiffres du jour à 14:05", async () => {
    const t = await lire("Patron", () => useTableauDuJour());
    expect(t.instant).toBe(a("14:05"));
    expect(t.compagnie).toBe("Alpha Voyages");
    expect(t.patron).toBe("M. Kamga");
    expect([t.nbGares, t.nbBus, t.nbPersonnes]).toEqual([3, 14, 23]);
    expect(t.jour).toEqual({
      recette: 2_610_000,
      variationPct: 8,
      comparaison: "mardi dernier",
      billets: 612,
      colis: 188,
      remplissagePct: 86,
      ecartTotal: -1000,
    });
    expect(t.assistant.nbInsights).toBe(2);
    expect(t.assistant.apercus).toEqual([
      "Le 09:30 Oméga te prend 40 clients",
      "Guichet 2 : 3 écarts en 10 jours",
    ]);
    expect(t.nbAlertes).toBe(6);
  });

  it("useAlertes : les 6 alertes, datées à Douala", async () => {
    const { alertes } = await lire("Patron", () => useAlertes());
    expect(alertes).toHaveLength(6);
    expect(alertes.map((x) => x.categorie)).toEqual([
      "ecart_caisse",
      "correspondance",
      "pin_bloque",
      "panne_bus",
      "momo_sans_correspondance",
      "financement",
    ]);
    expect(alertes[0]!.quand).toBe(a("14:00"));
    expect(alertes[3]!.quand).toBe(a("18:00", "2027-01-04"));
    expect(alertes[3]!.cibleId).toBe(BUS_LT207.id);
  });
});

describe("PatronEquipe · /(patron)/gares", () => {
  it("useGares : trois gares, quatre effectifs, dix personnes, la paie", async () => {
    const v = await lire("PatronEquipe", () => useGares());
    expect(v.instant).toBe(a("14:02"));
    expect([v.nbPersonnes, v.nbBus, v.enService]).toEqual([23, 14, 19]);
    expect(v.gares.map((g) => [g.nom, g.caisse])).toEqual([
      ["Akwa", 1_412_000],
      ["Mvan", 948_000],
      ["Bafoussam", 386_000],
    ]);
    expect(v.gares[0]).toMatchObject({
      id: ALPHA_AKWA.id,
      responsable: "Mme Essono",
      nbGuichets: 3,
      nbQuais: 2,
      synchro: { guichetsSynchronises: 3, guichets: 3 },
      ecartTotal: -1000,
      horsLigneDepuisMinutes: null,
    });
    expect(v.gares[2]).toMatchObject({
      id: ALPHA_BAFOUSSAM.id,
      ecartTotal: null,
      horsLigneDepuisMinutes: 40,
    });
    expect(v.effectifs).toEqual([
      { role: "guichetier", nombre: 9, enService: 8 },
      { role: "superviseur", nombre: 3, enService: 3 },
      { role: "convoyeur", nombre: 7, enService: 5 },
      { role: "chauffeur", nombre: 4, enService: 3 },
    ]);
    expect(v.personnes).toHaveLength(10);
    expect(v.personnes[0]).toMatchObject({
      id: JOSEPH_M.id,
      role: "guichetier",
      etat: "en_service",
    });
    expect(v.personnes.find((p) => p.nom === "Pauline N.")!.etat).toBe("bloquee");
    expect(v.paie).toEqual({ nbSalaires: 23, jourDuMois: 30, mode: "momo" });
  });
});

describe("PatronGare · /(patron)/gares/[gareId]", () => {
  it("useGare : caisse 1 412 000, trois guichets, deux quais, trois événements", async () => {
    const g = await lire("PatronGare", () => useGare(ALPHA_AKWA.id));
    expect(g.instant).toBe(a("14:02"));
    expect(g.superviseur).toBe("Mme Essono");
    expect(g.chiffres).toMatchObject({
      caisse: 1_412_000,
      billets: 318,
      remplissagePct: 86,
      colis: 96,
      colisAuRelais: 12,
      ecart: -1000,
      ecartGuichet: 2,
    });
    expect(g.guichets.map((x) => [x.rang, x.caisse, x.billets, x.ecart])).toEqual([
      [1, 612_000, 142, 0],
      [2, 694_500, 121, -1000],
      [3, 105_500, 55, 0],
    ]);
    expect(g.guichets[1]).toMatchObject({ clotureAttendPin: true, derniereSyncA: a("14:00") });
    expect(g.guichets[2]).toMatchObject({ etat: "bloque", bloqueDepuis: a("09:40") });
    expect(g.quais).toHaveLength(2);
    expect(g.quais[0]).toMatchObject({
      heureDepart: a("16:00"),
      origine: "Douala",
      destination: "Yaoundé",
      bus: "LT 412 AB",
      chauffeur: "Mbarga",
      convoyeur: "Alain B.",
      remplis: 27,
      capacite: 30,
      embarquementA: a("15:30"),
    });
    expect(g.quais[1]).toMatchObject({
      chauffeur: "Fotso",
      convoyeur: null,
      note: "09:30 Oméga en face",
    });
    expect(g.journal.map((e) => [e.at, e.etat])).toEqual([
      [a("09:40"), "ouvert"],
      [a("11:15"), "trace"],
      [a("14:00"), "attend_pin"],
    ]);
  });

  it("une gare sans planche de détail répond avec ce que la liste en sait", async () => {
    const g = await lire("PatronGare", () => useGare(ALPHA_BAFOUSSAM.id));
    expect(g.chiffres.caisse).toBe(386_000);
    expect(g.guichets).toEqual([]);
  });
});

describe("PatronPersonne · /(patron)/personnes/[personneId]", () => {
  it("useFichePersonne : Joseph M., 3 écarts négatifs en 10 jours", async () => {
    const f = await lire("PatronPersonne", () => useFichePersonne(JOSEPH_M.id));
    expect(f.personne).toMatchObject({
      id: JOSEPH_M.id,
      nom: "Joseph M.",
      role: "guichetier",
      depuis: "2027-01-05",
      telephoneMasque: "6 77 •• •• 23",
      operateur: "MTN",
      salaire: 95_000,
      jourDePaie: 30,
      superviseur: "Mme Essono",
      enServiceDepuis: a("05:30"),
    });
    expect(f.chiffres).toMatchObject({
      periodeJours: 90,
      billets: 1204,
      colis: 312,
      litiges: 0,
      annulations: 9,
      tauxAnnulationPct: 0.7,
      ecarts: { nombre: 3, total: -3500, sur: 10 },
    });
    expect(f.ecarts.tolerance).toBe(500);
    expect(f.ecarts.jours).toHaveLength(10);
    expect(f.ecarts.jours.reduce((s, j) => s + j.ecart, 0)).toBe(-3500);
    expect(f.ecarts.jours.filter((j) => j.ecart !== 0).map((j) => j.jour)).toEqual([
      "2026-12-08",
      "2026-12-12",
      "2026-12-15",
    ]);
    expect(f.journal.map((j) => [j.quand, j.cashCompte, j.cashAttendu, j.ecart])).toEqual([
      ["2026-12-15T14:00:00.000+01:00", 694_500, 695_500, -1000],
      ["2026-12-12T13:45:00.000+01:00", 581_000, 582_500, -1500],
      ["2026-12-08T14:10:00.000+01:00", 612_500, 613_500, -1000],
    ]);
  });

  it("une personne sans fiche dans le scénario répond 404", async () => {
    const e = await lireErreur("PatronPersonne", () => useFichePersonne("inconnue"));
    expect(e).toMatchObject({ genre: "http", statut: 404, code: "PERSONNE_INCONNUE" });
  });
});

describe("RapportSoir · /(patron)/rapport", () => {
  it("useRapportSoir : le rapport de 21:00", async () => {
    const r = await lire("RapportSoir", () => useRapportSoir());
    expect(r.jour).toBe("2027-01-05");
    expect(r.envoyeA).toBe(a("21:00"));
    expect(r.nbGares).toBe(3);
    expect(r.chiffres).toEqual({
      billets: 1004,
      variationBilletsPct: 6,
      colis: 312,
      litiges: 0,
      recette: 4_410_000,
      cash: 2_900_000,
      momo: 1_500_000,
    });
    expect(r.gares.map((g) => [g.nom, g.billets, g.ecart])).toEqual([
      ["Akwa", 491, -1000],
      ["Mvan", 338, 0],
      ["Bafoussam", 175, 0],
    ]);
    expect(r.gares.map((g) => g.remarques)).toEqual([
      ["3 guichets clôturés", "guichet 2, validé par Essono"],
      ["1 départ fusionné (16:00 + 16:30)"],
      ["soute pleine à 10:00"],
    ]);
    expect(r.enRoute).toMatchObject({ billetsConvoyeurs: 23, controles: 1, regularisations: 1 });
    expect(r.remplissage.moyenPct).toBe(84);
    expect(r.annulations).toEqual({ nombre: 5, montant: 20_000, toutesAvecPin: true });
    expect(r.enLigne).toEqual({ billets: 61, partPct: 6 });
    expect(r.signatures).toEqual([
      { nom: "Essono", gare: "Akwa" },
      { nom: "Tchinda", gare: "Mvan" },
      { nom: "Fosso", gare: "Baf." },
    ]);
    expect(r.questionSuggeree.question).toBe("Pourquoi le 09:30 Oméga part si vide ?");
  });
});

describe("Analyses · /(patron)/analyses", () => {
  it("useAnalyses : 28,4 M sur la semaine, la série de recette somme exactement au total", async () => {
    const x = await lire("Analyses", () => useAnalyses("semaine"));
    expect(x.libelle).toBe("Semaine du 29 déc. au 4 janv.");
    expect(x.nbGares).toBe(3);
    expect(x.recette.total).toBe(28_400_000);
    expect(x.recette.variationPct).toBe(5);
    expect(x.recette.serie.map((p) => p.libelle)).toEqual(["L", "M", "M", "J", "V", "S", "D"]);
    expect(x.recette.serie.reduce((s, p) => s + p.recette, 0)).toBe(28_400_000);
    const max = Math.max(...x.recette.serie.map((p) => p.recette));
    expect(x.recette.serie[5]!.recette).toBe(max);
    expect(x.lignes).toHaveLength(6);
    expect(x.lignes[1]).toEqual({
      ligneId: ALPHA_DLA_BAF.id,
      nom: "Douala → Bafoussam",
      remplissagePct: 78,
      recette: 8_100_000,
    });
    expect(x.lignes[0]!.ligneId).toBe(ALPHA_DLA_YDE.id);
    expect(x.colis).toEqual({ nombre: 2104, recette: 2_100_000 });
    expect(x.bus).toHaveLength(7);
    expect(x.bus[2]).toMatchObject({
      busId: BUS_LT207.id,
      immatriculation: "LT 207 AB",
      chauffeur: "Nana",
      net: 600_000,
      incident: "2 pannes",
    });
  });

  it("les autres périodes ne sont pas dans le scénario : 404 explicite", async () => {
    const e = await lireErreur("Analyses", () => useAnalyses("mois"));
    expect(e).toMatchObject({ statut: 404, code: "PERIODE_INDISPONIBLE" });
  });
});

describe("AnalysesLigne · /(patron)/analyses/ligne/[ligneId]", () => {
  it("useAnalyseLigne : Douala → Bafoussam, 78 % de remplissage", async () => {
    const l = await lire("AnalysesLigne", () => useAnalyseLigne(ALPHA_DLA_BAF.id));
    expect(l.ligne).toEqual({ id: ALPHA_DLA_BAF.id, nom: "Douala → Bafoussam" });
    expect(l.departsParJour).toBe(5);
    expect(l.recette).toEqual({ total: 8_100_000, variationPct: -14 });
    expect(l.billets).toEqual({ nombre: 2104, departs: 35 });
    expect(l.remplissage).toEqual({ pct: 78, cible: 85 });
    expect(l.colis).toEqual({ nombre: 612, variationPct: 9 });
    expect(l.departs.map((d) => [d.heure, d.classe, d.prix, d.remplissagePct])).toEqual([
      ["06:00", "classique", 3500, 94],
      ["08:15", "classique", 3500, 88],
      ["10:00", "classique", 3500, 55],
      ["13:00", "classique", 3500, 76],
      ["16:30", "vip", 5000, 81],
    ]);
    expect(l.departs[0]).toMatchObject({ bus: "LT 118 AB", note: null, concurrent: null });
    expect(l.departs[1]!.note).toBe("soute colis");
    expect(l.departs[2]!.concurrent).toEqual({ compagnie: "Oméga", heure: "09:30", prix: 3000 });
    expect(l.parJour.serie).toHaveLength(7);
    expect(l.parJour.serie.reduce((s, p) => s + p.recette, 0)).toBe(8_100_000);
    expect(l.canaux.enLigne).toEqual({ partPct: 11, billets: 231, variationPts: 3 });
    expect(l.canaux.enRoute).toEqual({
      billets: 96,
      arrets: ["Bafang", "Mbouda"],
      tousEnregistres: true,
    });
  });
});

describe("AnalysesBus · /(patron)/analyses/bus/[busId]", () => {
  it("useAnalyseBus : LT 207 AB, deux pannes en 10 jours", async () => {
    const b = await lire("AnalysesBus", () => useAnalyseBus(BUS_LT207.id));
    expect(b.bus).toMatchObject({
      immatriculation: "LT 207 AB",
      modele: "Coaster",
      capacite: 30,
      annee: 2019,
    });
    expect(b.chauffeur.nom).toBe("Nana");
    expect(b.statut).toBe("a_surveiller");
    expect(b.recette).toEqual({ total: 3_100_000, trajets: 5, remplissagePct: 71 });
    expect(b.depenses).toEqual({ total: 2_500_000, carburant: 1_600_000, pannes: 700_000 });
    expect(b.net).toBe(600_000);
    expect(b.netMoyenFlotte).toBe(2_100_000);
    expect(b.netParSemaine.serie.map((p) => p.libelle)).toEqual([
      "S41",
      "S42",
      "S43",
      "S44",
      "S45",
      "S46",
      "S47",
      "S48",
    ]);
    expect(b.netParSemaine.serie[7]!.net).toBe(600_000);
    expect(b.netParSemaine.variationPct).toBe(-62);
    expect(b.trajets).toHaveLength(5);
    expect(b.trajets[0]).toMatchObject({
      jour: "lun",
      heure: "06:00",
      origine: "Douala",
      destination: "Bafoussam",
      passagers: { remplis: 28, capacite: 30 },
      recette: 98_000,
      retardMinutes: 0,
      incident: null,
      net: 61_000,
    });
    expect(b.trajets[1]).toMatchObject({
      incident: { nature: "panne", dureeMinutes: 130 },
      net: -310_000,
    });
    expect(b.trajets[2]).toMatchObject({ jour: "jeu", retardMinutes: 25, recette: 66_500 });
    expect(b.trajets[4]!.incident).toMatchObject({ dureeMinutes: 40 });
    expect(b.avisAssistant).toMatch(/LT 207 au garage lundi/);
  });
});

describe("Assistant · /(patron)/assistant", () => {
  it("useInsightsAssistant : l'argent qui fuit et l'argent à gagner", async () => {
    const i = await lire("Assistant", () => useInsightsAssistant());
    expect(i.fuites).toHaveLength(1);
    expect(i.fuites[0]).toMatchObject({
      periodeJours: 10,
      montantTotal: -4500,
      joursConcernes: [2, 8, 10],
    });
    expect(i.fuites[0]!.actions.map((x) => x.type)).toEqual([
      "controle_inopine",
      "regle_cadence_numero",
    ]);
    expect(i.gains[0]!.simulation).toEqual({
      scenarios: [
        { libelle: "aujourd'hui", remplis: 24, capacite: 40 },
        { libelle: "à 09:15", remplis: 37, capacite: 40 },
      ],
      gainMensuel: 1_500_000,
    });
    expect(i.gains[0]!.action.type).toBe("decaler_depart");
    expect(i.questionsSuggerees).toHaveLength(3);
  });
});

describe("AssistantReponse · /(patron)/assistant/reponse", () => {
  it("useConversationAssistant : deux échanges, le second avec sa simulation", async () => {
    const conv = await lire("AssistantReponse", () => useConversationAssistant());
    expect(conv.baseJours).toBe(30);
    expect(conv.echanges).toHaveLength(2);
    expect(conv.echanges[0]).toMatchObject({
      question: "Pourquoi Bafoussam baisse ?",
      dureeSecondes: 4,
    });
    expect(conv.echanges[0]!.points).toHaveLength(3);
    expect(conv.echanges[0]!.actions.map((x) => x.type)).toEqual(["ajouter_depart", "voir_ligne"]);
    // Les actions qui ouvrent une ligne la portent ; le diagnostic porte son graphique, pas la simulation.
    expect(conv.echanges[0]!.actions.map((x) => x.ligneId)).toEqual([
      ALPHA_DLA_BAF.id,
      ALPHA_DLA_BAF.id,
    ]);
    expect(conv.echanges[0]!.graphique).toEqual({
      valeurs: [80, 78, 42, 74, 90, 100, 70, 76, 72, 38, 70, 86, 96, 66],
      joursEnEcart: [3, 10],
    });
    expect(conv.echanges[1]!.graphique).toBeUndefined();
    expect(conv.echanges[1]!.simulation).toEqual({
      options: [
        { libelle: "09:15", gainMensuel: 1_500_000 },
        { libelle: "3 500", gainMensuel: -400_000 },
      ],
    });
  });
});

describe("Comptable · /(patron)/comptable", () => {
  it("useSyntheseComptable : rapprochement de décembre et cinq exports", async () => {
    const s = await lire("Comptable", () => useSyntheseComptable());
    expect(s).toMatchObject({
      mois: "2026-12",
      libelle: "Décembre 2026",
      jourDeCloture: 5,
      statut: "ouvert",
    });
    expect(s.moisDisponibles.map((m) => m.mois)).toEqual(["2026-12", "2026-11", "2026-10"]);
    expect(s.rapprochement).toEqual({
      tauxRapprochePct: 99.8,
      ventesMomo: { nombre: 1912, montant: 7_648_000 },
      recuMarchand: 7_632_000,
      sansCorrespondance: { transactions: 4, montant: 16_000 },
    });
    expect(s.exports.map((x) => x.id)).toEqual([
      "journal_ventes",
      "journal_caisse",
      "annulations",
      "ecritures_syscohada",
      "factures_afrimove",
    ]);
    expect(s.exports[0]!.lignes).toBe(31_404);
    expect(s.exports[4]!.statut).toBe("a_jour");
    expect(s.cabinet).toEqual({
      destinataire: "cabinet@…",
      automatique: true,
      jourDEnvoi: 2,
      derniersEnvoisRecus: 3,
    });
  });
});

describe("ComptableRapprochement · /(patron)/comptable/rapprochement", () => {
  it("useRapprochementMomo : 4 transactions, 16 000 F, une cause probable chacune", async () => {
    const r = await lire("ComptableRapprochement", () => useRapprochementMomo());
    expect(r).toMatchObject({
      transactions: 4,
      surTotalVentes: 1912,
      montantTotal: 16_000,
      partPct: 0.2,
    });
    expect(r.lignes.map((l) => [l.reference, l.montant, l.cause, l.actionProposee])).toEqual([
      ["MP261203.1142.A71290", 4000, "doublon_paiement", "rembourser"],
      ["OM261209.0658.K01884", 4000, "paiement_apres_expiration", "rembourser"],
      ["MP261217.1930.B55012", 5000, "scan_depot_manquant", "rattacher"],
      ["OM261228.1405.Q77731", 3000, "inconnue", "demander"],
    ]);
    expect(r.lignes[0]).toMatchObject({
      recueA: "2026-12-03T11:42:00.000+01:00",
      telephoneMasque: "6 77 •• •• 41",
      operateur: "mtn",
      decision: null,
    });
    expect(r.lignes[1]!.operateur).toBe("orange");
    expect(r.lignes[2]!.cibleSuggeree).toBe("C-ALP-DLA-261217-0141");
    expect(r.lignes.reduce((s, l) => s + l.montant, 0)).toBe(r.montantTotal);
  });
});

describe("ComptableApercu · /(patron)/comptable/apercu/[exportId]", () => {
  it("useApercuExport : 10 lignes sur 31 404, total 28 414 000", async () => {
    const x = await lire("ComptableApercu", () => useApercuExport("journal_ventes"));
    expect(x.export).toMatchObject({
      id: "journal_ventes",
      format: "XLSX",
      nom: "Journal des ventes · décembre",
      lignes: 31_404,
      colonnes: 11,
      tailleOctets: 1_200_000,
    });
    expect(x.onglets.map((o) => o.id)).toEqual(["ventes", "par_jour", "par_guichet", "totaux"]);
    expect(x.tableau.colonnes).toHaveLength(9);
    expect(x.tableau.lignes).toHaveLength(10);
    expect(x.tableau.lignes[0]).toEqual([
      "2026-12-01",
      "05:52",
      "DLA-YDE",
      "06:00",
      "12",
      "CLASS.",
      5000,
      "CASH",
      "GU1 · JM",
    ]);
    expect(x.tableau.lignes[5]![4]).toBeNull();
    expect(x.tableau).toMatchObject({
      premiere: 1,
      derniere: 10,
      total: 31_404,
      totalMontant: 28_414_000,
    });
    expect(x.signe).toBe(true);
  });

  it("useApercuExport(onglet) : un onglet connu répond, un inconnu est un 404 ONGLET_INCONNU", async () => {
    const x = await lire("ComptableApercu", () =>
      useApercuExport("journal_ventes", undefined, "par_jour"),
    );
    expect(x.onglets.map((o) => o.id)).toContain("par_jour");
    const erreur = await lireErreur("ComptableApercu", () =>
      useApercuExport("journal_ventes", undefined, "nexiste_pas"),
    );
    expect(erreur).toMatchObject({ statut: 404, code: "ONGLET_INCONNU" });
  });

  it("useFichierExport : remet un vrai fichier (nom, type, octets) qui contient les lignes de l'aperçu", async () => {
    const client = clientPatron("ComptableApercu");
    const { result } = renderHook(() => useFichierExport(), { wrapper: enveloppe(client) });
    let fichier!: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      fichier = await result.current.mutateAsync({ exportId: "journal_ventes" });
    });
    expect(fichier.nom).toBe("journal-des-ventes-decembre.csv");
    expect(fichier.typeMime).toContain("text/csv");
    const texte = new TextDecoder().decode(fichier.octets);
    const lignes = texte.trimEnd().split("\r\n");
    expect(lignes).toHaveLength(11);
    expect(lignes[0]).toBe("date;heure;ligne;dép.;siège;classe;prix;mode;guichet");
    expect(lignes[1]).toBe("2026-12-01;05:52;DLA-YDE;06:00;12;CLASS.;5000;CASH;GU1 · JM");

    const erreur = await result.current.mutateAsync({ exportId: "annulations" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erreur).toMatchObject({ statut: 404 });
  });
});

describe("ComptableCloture · /(patron)/comptable/cloture", () => {
  it("useClotureMois : décembre clôturé le 5 janvier à 09:12, 5 fichiers envoyés", async () => {
    const m = await lire("ComptableCloture", () => useClotureMois());
    expect(m).toMatchObject({
      mois: "2026-12",
      statut: "cloture",
      clotureA: a("09:12"),
      verrouille: true,
      encaisse: { total: 28_414_000, cash: 20_766_000, momo: 7_648_000, ecart: 0 },
    });
    expect(m.envoi).toMatchObject({ destinataire: "cabinet@…", recuA: a("09:13") });
    expect(m.envoi.fichiers.map((f) => [f.id, f.format])).toEqual([
      ["journal_ventes", "xlsx"],
      ["journal_caisse", "xlsx"],
      ["annulations", "csv"],
      ["ecritures_syscohada", "csv"],
      ["factures_afrimove", "pdf"],
    ]);
    expect(m.envoi.fichiers[0]!.tailleOctets).toBe(1_200_000);
    expect(m.envoi.fichiers[4]).toMatchObject({ pages: 2, tailleOctets: null });
    expect(m.apercuJournal).toHaveLength(4);
    // Les quatre transactions sans correspondance sont traitées : le nombre vient de la clôture.
    expect(m.transactionsTraitees).toBe(4);
  });
});

describe("Config · /(patron)/reglages", () => {
  it("useReglages : trois lignes, 23 personnes, règles de l'agence", async () => {
    const r = await lire("Config", () => useReglages());
    expect(r.lignes.map((l) => [l.nom, l.nbDeparts])).toEqual([
      ["Douala → Yaoundé", 8],
      ["Douala → Bafoussam", 5],
      ["Yaoundé → Bafoussam", 3],
    ]);
    expect(r.lignes[0]).toMatchObject({
      id: ALPHA_DLA_YDE.id,
      tarifs: { classique: 4000, vip: 5500, bagage: 1000 },
      propositionAssistant: "10:00 → 09:15",
    });
    expect(r.lignes[1]).toMatchObject({
      tarifs: { classique: 3500, vip: 5000, bagage: 1000 },
      arrets: ["Bafang", "Mbouda"],
      propositionAssistant: null,
    });
    expect(r.equipe.total).toBe(23);
    expect(r.equipe.effectifs).toEqual([
      { role: "guichetier", nombre: 9 },
      { role: "superviseur", nombre: 3 },
      { role: "convoyeur", nombre: 7 },
      { role: "chauffeur", nombre: 4 },
    ]);
    expect(r.equipe.apercu.map((p) => p.nom)).toEqual(["Joseph M.", "Marie T.", "Pauline N."]);
    expect(r.regles.caisse.toleranceEcart).toBe(1000);
    expect(r.regles.fraisService).toEqual({ montant: 250, priseEnChargeParAgence: false });
    expect(r.regles.cadence.numeroObligatoire).toBe(false);
  });
});

describe("ConfigLigne · /(patron)/reglages/ligne/[ligneId]", () => {
  it("useLigneEditable : le brouillon de Douala → Bafoussam", async () => {
    const l = await lire("ConfigLigne", () => useLigneEditable(ALPHA_DLA_BAF.id));
    expect(l.nom).toBe("Douala → Bafoussam");
    expect(l.departs.map((d) => [d.heure, d.heureInitiale, d.nouveau, d.jours])).toEqual([
      ["06:00", null, false, []],
      ["08:15", null, false, []],
      ["09:15", "10:00", false, []],
      ["13:00", null, false, []],
      ["17:00", null, true, ["mar"]],
    ]);
    expect(l.departs[2]).toMatchObject({ id: expect.any(String), note: "proposé par l'assistant" });
    expect(l.departs[4]!.id).toBeNull();
    expect(l.tarifs).toEqual({ classique: 3500, vip: 5000, bagage: 1000 });
    expect(l.arrets).toEqual([
      { nom: "Bafang", prorata: 2000, montee: true },
      { nom: "Mbouda", prorata: 2800, montee: true },
    ]);
    expect(l.plan).toEqual({ capacite: 40, disposition: "2+2", rangees: 11 });
    expect(l.options).toEqual({ venteEnLigne: true, fusionAuto: false });
    expect(l.brouillon).toEqual({ modifications: 2, publicationA: a("00:00", "2027-01-11") });
  });
});

describe("ConfigPersonne · /(patron)/reglages/personne/[personneId]", () => {
  it("usePersonneEditable : la fiche de Joseph M., droits par défaut du rôle", async () => {
    const p = await lire("ConfigPersonne", () => usePersonneEditable(JOSEPH_M.id));
    expect(p).toMatchObject({
      id: JOSEPH_M.id,
      telephone: JOSEPH_M.telephone,
      operateur: "MTN",
      role: "guichetier",
      gareId: ALPHA_AKWA.id,
      guichet: "2",
      salaire: 95_000,
      depuis: "2027-01-05",
      actif: true,
      droits: {
        vendreBilletsEtColis: true,
        annulerSansPinSuperviseur: false,
        modeCadence: true,
        voirCaissesDesAutres: false,
      },
    });
  });
});

describe("ConfigRegles · /(patron)/reglages/regles", () => {
  it("useRegles : annulation, tolérance de caisse, comptes MoMo", async () => {
    const r = await lire("ConfigRegles", () => useRegles());
    expect(r.annulation).toEqual({
      gratuiteJusqua: "1h_avant",
      retenue: "selon_classe",
      retenueParClassePct: { classique: 10, vip: 20 },
    });
    expect(r.caisse).toEqual({ toleranceEcart: 1000, auDela: "pin_superviseur_et_patron" });
    expect(r.comptesMomo).toEqual({
      mtn: { numeroMasque: "6 77 •• •• 02" },
      orange: { numeroMasque: "6 99 •• •• 77" },
    });
  });
});

describe("ConfigEquipeListe · /(patron)/reglages/equipe", () => {
  it("useEquipe({ role }) : les 9 guichetiers, 8 en service, 1 bloquée", async () => {
    const e = await lire("ConfigEquipeListe", () => useEquipe({ role: "guichetier" }));
    expect(e.total).toBe(23);
    expect(e.roles.map((r) => [r.role, r.nombre])).toEqual([
      ["guichetier", 9],
      ["superviseur", 3],
      ["convoyeur", 7],
      ["chauffeur", 4],
    ]);
    expect(e.personnes).toHaveLength(9);
    expect(e.personnes.every((p) => p.role === "guichetier")).toBe(true);
    expect(e.resume).toEqual({ role: "guichetier", total: 9, enService: 8, bloquees: 1 });
  });

  it("la recherche filtre par nom ou par lieu", async () => {
    const e = await lire("ConfigEquipeListe", () => useEquipe({ recherche: "guichet 3" }));
    expect(e.personnes.map((p) => p.nom)).toEqual(["Pauline N."]);
  });
});

describe("Modules · /(patron)/reglages/modules", () => {
  it("useModules : 10 modules actifs sur 12", async () => {
    const m = await lire("Modules", () => useModules());
    expect(m.total).toBe(12);
    expect(m.actifs).toBe(10);
    expect(m.modules.filter((x) => !x.actif).map((x) => x.code)).toEqual([
      "covoit_vendeurs",
      "financement",
    ]);
    expect(m.modules[0]).toMatchObject({ code: "guichet_caisse", socle: true, actif: true });
    expect(m.modules.filter((x) => x.socle)).toHaveLength(1);
  });
});

describe("Financement · /(patron)/financement", () => {
  it("useOffreFinancement : avance de 6 M éligible jusqu'à 12 M", async () => {
    const o = await lire("Financement", () => useOffreFinancement());
    expect(o.partenaire).toBeNull();
    expect(o.conventionSignee).toBe(false);
    expect(o.avance).toEqual({
      statut: "eligible",
      plafond: 12_000_000,
      equivalentJoursDeVentes: 10,
      montantPropose: 6_000_000,
      conditions: { remboursementPctVentesMomo: 8, dureeEstimeeSemaines: 7, coutTotalPct: null },
      versementSousHeures: 24,
    });
    expect(o.creditMateriel).toMatchObject({
      montantTotal: 1_100_000,
      mensualites: 12,
      montantMensualite: 100_000,
    });
    expect(o.paie).toEqual({ nbSalaires: 23, jourDeVersement: "vendredi" });
    expect(o.billetEnDeuxFois).toEqual({
      actif: false,
      exemple: { prixBillet: 7500, reservation: 4000, veille: 3500 },
    });
  });
});

describe("FinancementDemande · /(patron)/financement/demande/[dossierId]", () => {
  it("useDossierFinancement : AV-2027-0041 en analyse", async () => {
    const d = await lire("FinancementDemande", () => useDossierFinancement("AV-2027-0041"));
    expect(d).toMatchObject({
      id: "AV-2027-0041",
      statut: "en_analyse",
      montant: 6_000_000,
      envoyeA: a("10:04"),
      reponseAvant: a("10:04", "2027-01-06"),
      retirable: true,
    });
    expect(d.pieces).toHaveLength(4);
    expect(d.suivi.map((e) => [e.code, e.etat])).toEqual([
      ["envoye", "fait"],
      ["analyse", "en_cours"],
      ["versement", "a_venir"],
    ]);
    expect(d.conditions.remboursementPctVentesMomo).toBe(8);
  });
});

describe("InterAgences · /(patron)/inter-agences", () => {
  it("useInterAgences : deux tronçons, règlement net de 12 300 F lundi 08:00", async () => {
    const v = await lire("InterAgences", () => useInterAgences());
    expect(v.colisEnCorrespondance).toMatchObject({
      numero: "C-ALP-DLA-270105-0088",
      origine: "Douala",
      destination: "Bamenda",
      poidsKg: 3,
    });
    expect(
      v.colisEnCorrespondance?.troncons.map((t) => [
        t.rang,
        t.compagnie,
        t.heureDepart,
        t.bus,
        t.heureArrivee,
        t.part,
      ]),
    ).toEqual([
      [1, "Alpha", "08:15", "LT 118 AB", "13:00", 1500],
      [2, "Oméga", "14:00", "OU 302 NW", "16:30", 1200],
    ]);
    expect(v.reglement).toEqual({
      autreCompagnie: "Oméga",
      nousDoit: 19_500,
      nbColisTransportesPourEux: 14,
      nousLeDevons: 7200,
      nbColisEnCorrespondance: 6,
      soldeNet: 12_300,
      reglementA: a("08:00", "2027-01-11"),
    });
    expect(v.correspondanceVoyageurs).toEqual({
      minutesGaranties: 25,
      attenteDuSecondBusMinutes: 15,
      // L'origine du billet voyageur (« Yaoundé → Bamenda en un seul billet : Alpha jusqu'à Bafoussam, Oméga ensuite »).
      trajet: {
        origine: "Yaoundé",
        via: "Bafoussam",
        destination: "Bamenda",
        premiere: "Alpha",
        seconde: "Oméga",
      },
    });
    expect(v.conventions).toEqual([{ id: ID_CONVENTION_OMEGA, avec: "Oméga", statut: "active" }]);
  });
});

describe("InterAgencesConvention · /(patron)/inter-agences/convention/[conventionId]", () => {
  it("useConventionInterAgences : le contrat unique de la convention (parts, 5 règles, signatures, bilan, pied)", async () => {
    const c = await lire("InterAgencesConvention", () =>
      useConventionInterAgences(ID_CONVENTION_OMEGA),
    );
    expect(c).toMatchObject({ id: ID_CONVENTION_OMEGA, statut: "active" });
    expect(c.titre).toContain("Alpha");
    expect(c.titre).toContain("Oméga");
    expect(c.parts.lignes.map((l) => l.troncon)).toEqual([
      "Douala → Bafoussam",
      "Bafoussam → Bamenda",
      "Transbordement à Bafoussam",
    ]);
    expect(c.parts.lignes[0]!.parts).toEqual({ Alpha: 1400, Oméga: null });
    expect(c.parts.total).toMatchObject({
      prixClient: 3000,
      fraisAfrimove: 150,
      parts: { Alpha: 1600, Oméga: 1400 },
    });
    expect(c.regles.liste.map((r) => r.rang)).toEqual([1, 2, 3, 4, 5]);
    expect(c.regles.liste[0]!.titre).toBe("Responsabilité au scan.");
    expect(c.signatures.map((s) => [s.compagnie, s.signataire, s.moi, s.parPin])).toEqual([
      ["Alpha", "Toi", true, true],
      ["Oméga", "E. Tchoua", false, true],
    ]);
    expect(c.trimestre).toMatchObject({
      colisEchanges: 184,
      litiges: 1,
      netRecu: 131_000,
      lundis: 12,
    });
    expect(c.pied.length).toBeGreaterThan(0);
  });

  it("c'est la même convention que celle du module colis : une seule source, un seul contrat", async () => {
    const c = await lire("InterAgencesConvention", () =>
      useConventionInterAgences(ID_CONVENTION_OMEGA),
    );
    expect(() => contratsColis.SchemaConvention.parse(c)).not.toThrow();
  });
});

describe("Controle · /controle", () => {
  it("useSalleDeControle : le direct des trois gares à 14:05", async () => {
    const s = await lire("Controle", () => useSalleDeControle());
    expect(s).toMatchObject({
      compagnie: "Alpha Voyages",
      jour: "2027-01-05",
      instant: a("14:05"),
      nbGares: 3,
      nbBus: 14,
      synchro: { garesSynchronisees: 3, gares: 3 },
    });
    expect(s.chiffres).toEqual({
      recette: 2_610_000,
      variationPct: 8,
      billets: 612,
      billetsEnLigne: 37,
      billetsEnRoute: 11,
      colis: 188,
      colisEnCorrespondance: 6,
      litiges: 0,
      remplissagePct: 86,
      departs: 22,
      departsFusionnes: 2,
      ecartsDeCaisse: { total: -1000, caissesEnEcart: 1, caisses: 9 },
    });
    expect(s.carte).toEqual({
      busEnRoute: 9,
      villes: ["Douala · 3 guichets", "Yaoundé · 2 guichets", "Bafoussam", "Bamenda · via Oméga"],
      alerte: { immatriculation: "LT 207 AB", arretMinutes: 12, soupcon: "panne" },
    });
    expect(s.gares.map((g) => [g.nom, g.billets, g.colis, g.cashAttendu, g.ecart])).toEqual([
      ["Douala Akwa", 291, 98, 1_412_500, -1000],
      ["Yaoundé Mvan", 208, 61, 902_000, 0],
      ["Bafoussam", 113, 29, 431_000, 0],
    ]);
    expect(s.gares[0]!.prochainDepart).toEqual({
      heure: "14:30",
      destination: "Yaoundé",
      remplis: 38,
      capacite: 40,
    });
    expect(s.gares[2]!.superviseur).toEqual({
      nom: "Fosso",
      enLigne: false,
      horsLigneDepuisMinutes: 4,
    });
    expect(s.gares[0]!.superviseur).toEqual({
      nom: "Essono",
      enLigne: true,
      horsLigneDepuisMinutes: null,
    });
    expect(s.aTraiter.map((x) => [x.type, x.quand])).toEqual([
      ["cloture_en_attente", a("14:00")],
      ["bus_arrete", a("13:53")],
      ["correspondance", a("13:40")],
      ["proposition_assistant", a("12:10")],
    ]);
    const realisees = s.ventesParHeure.heures.filter((h) => !h.prevu);
    expect(s.ventesParHeure.heures).toHaveLength(12);
    expect(realisees).toHaveLength(9);
    expect(realisees.reduce((somme, h) => somme + h.montant, 0)).toBe(2_610_000);
    expect(s.ventesParHeure.heures[0]!.heure).toBe(5);
    expect(s.ventesParHeure.previsionCloture).toBe(4_400_000);
    expect(s.rapport).toEqual({
      envoiA: a("21:00"),
      destinataires: { patron: "M. Kamga", superviseurs: 3 },
      caissesAValider: 1,
    });
  });
});

describe("le monde patron complet (scénario « defaut »)", () => {
  it("répond à tous les écrans patron sans passer par leur planche", async () => {
    const t = await lire("defaut", () => useTableauDuJour());
    expect(t.jour.recette).toBe(2_610_000);
    expect((await lire("defaut", () => useModules())).total).toBe(12);
    expect((await lire("defaut", () => useSalleDeControle())).chiffres.billets).toBe(612);
    expect((await lire("defaut", () => useGare(ALPHA_AKWA.id))).guichets).toHaveLength(3);
    expect((await lire("defaut", () => useReglages())).lignes).toHaveLength(3);
  });
});
