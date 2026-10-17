import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RapportIntrouvable, RapportPasEncore } from "./erreurs";
import type { RapportSoir } from "./modele";
import { AssistantRapport } from "./ports";
import {
  AKWA,
  AUTRE_COMPAGNIE,
  BAFOUSSAM,
  COMPAGNIE,
  GARE_AUTRE,
  JOUR,
  MVAN,
  VINGT_ET_UNE_HEURES,
  billet,
  caisse,
  colis,
  depart,
  instant,
  monterRapport,
  peuplerPlanche,
  type MontageRapport,
} from "./testing/montage";

beforeEach(() => {
  for (const niveau of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, niveau).mockImplementation(() => undefined);
  }
});
afterEach(() => vi.restoreAllMocks());

const F = " ";

async function rapportDe(m: MontageRapport, compagnieId = COMPAGNIE): Promise<RapportSoir> {
  return (await m.service.generer(compagnieId, JOUR)).rapport;
}

describe("le rapport de la planche RapportSoir, reconstitué depuis les faits", () => {
  it("retombe sur les chiffres de la maquette, au franc près", async () => {
    const m = monterRapport();
    peuplerPlanche(m);
    m.allerA(VINGT_ET_UNE_HEURES);
    const r = await rapportDe(m);

    expect(r.titre).toBe("Rapport du mardi 5 janvier · 3 gares");
    expect(r.envoyeA).toBe("2027-01-05T21:00:00.000+01:00");
    expect(r.chiffres).toEqual({
      billets: 1_004,
      variationBilletsPct: 6, // 1 004 contre 947 la veille
      colis: 312,
      litiges: 0,
      recette: 4_410_000, // « 4,41 M »
      cash: 2_900_000, // « cash 2,9 »
      momo: 1_510_000, // « MoMo 1,5 »
    });
    expect(r.gares).toEqual([
      {
        gareId: AKWA,
        nom: "Akwa",
        billets: 491,
        ecart: -1_000,
        remarques: ["3 guichets clôturés", "guichet 2, validé par Essono"],
      },
      {
        gareId: MVAN,
        nom: "Mvan",
        billets: 338,
        ecart: 0,
        remarques: ["1 départ fusionné (16:00 + 16:30)"],
      },
      {
        gareId: BAFOUSSAM,
        nom: "Bafoussam",
        billets: 175,
        ecart: 0,
        remarques: ["soute pleine à 10:00"],
      },
    ]);
    expect(r.enRoute).toEqual({
      billetsConvoyeurs: 23,
      controles: 1,
      regularisations: 1,
      texte:
        "23 billets vendus par les convoyeurs, tous enregistrés · 1 contrôle : 1 régularisation à Edéa",
    });
    expect(r.remplissage).toEqual({ moyenPct: 84, remarque: "le 09:30 Oméga part à 55 %" });
    expect(r.annulations).toEqual({ nombre: 5, montant: 20_000, toutesAvecPin: true });
    expect(r.enLigne).toEqual({ billets: 61, partPct: 6.1 });
    expect(r.signatures).toEqual([
      { nom: "Essono", gare: "Akwa" },
      { nom: "Tchinda", gare: "Mvan" },
      { nom: "Fosso", gare: "Bafoussam" },
    ]);
    expect(r.nbGares).toBe(3);
  });

  it("cash et mobile money font exactement la recette", async () => {
    const m = monterRapport();
    peuplerPlanche(m);
    const r = await rapportDe(m);
    expect(r.chiffres.cash + r.chiffres.momo).toBe(r.chiffres.recette);
    expect(r.gares.reduce((s, g) => s + g.billets, 0)).toBe(r.chiffres.billets);
  });
});

describe("un rapport par compagnie et par jour, arrêté une fois pour toutes", () => {
  it("rend le même rapport à la seconde demande, sans rien recalculer ni réécrire", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet({ montant: 3_500 }));
    m.allerA(VINGT_ET_UNE_HEURES);
    const premier = await m.service.generer(COMPAGNIE, JOUR);
    expect(premier.nouveau).toBe(true);

    // Après 21 h : une caisse est validée, des billets sont vendus tard. Le rapport ne change pas.
    m.ventes.ajouter(COMPAGNIE, billet({ montant: 9_999, venduA: instant("22:30") }));
    m.caisses.ajouter(COMPAGNIE, JOUR, caisse({ ecart: -5_000 }));
    m.horloge.avancer(2 * 3_600_000);
    const second = await m.service.generer(COMPAGNIE, JOUR);

    expect(second.nouveau).toBe(false);
    expect(second.rapport).toEqual(premier.rapport);
    expect(second.rapport.chiffres.recette).toBe(3_500);
    expect(m.rapports.taille).toBe(1);
  });

  it("ne relit aucune source quand le rapport est déjà arrêté", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet());
    await m.service.generer(COMPAGNIE, JOUR);
    const lire = vi.spyOn(m.ventes, "duJour");
    await m.service.generer(COMPAGNIE, JOUR);
    await m.service.pourLApp(COMPAGNIE, JOUR);
    expect(lire).not.toHaveBeenCalled();
  });

  it("deux instances qui arrêtent le rapport en même temps n'en produisent qu'un", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet());
    m.allerA(VINGT_ET_UNE_HEURES);
    const resultats = await Promise.all([
      m.service.generer(COMPAGNIE, JOUR),
      m.service.generer(COMPAGNIE, JOUR),
      m.service.generer(COMPAGNIE, JOUR),
    ]);
    expect(m.rapports.taille).toBe(1);
    expect(resultats.filter((r) => r.nouveau).length).toBeGreaterThanOrEqual(1);
    expect(new Set(resultats.map((r) => JSON.stringify(r.rapport))).size).toBe(1);
  });

  it("garde le rapport de chaque jour et de chaque compagnie séparément", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet({ montant: 3_500 }));
    m.ventes.ajouter(AUTRE_COMPAGNIE, billet({ gareId: GARE_AUTRE, montant: 7_000 }));
    m.allerA(VINGT_ET_UNE_HEURES);
    const alpha = await rapportDe(m, COMPAGNIE);
    const beta = await rapportDe(m, AUTRE_COMPAGNIE);
    expect(alpha.chiffres.recette).toBe(3_500);
    expect(beta.chiffres.recette).toBe(7_000);
    expect(beta.gares.map((g) => g.nom)).toEqual(["Bonabéri"]);
    expect(m.rapports.taille).toBe(2);
  });

  it("refuse une compagnie inconnue", async () => {
    const m = monterRapport();
    await expect(m.service.generer("inconnue", JOUR)).rejects.toBeInstanceOf(RapportIntrouvable);
    expect(m.rapports.taille).toBe(0);
  });

  it("ne lit que la compagnie demandée", async () => {
    const m = monterRapport();
    m.ventes.ajouter(AUTRE_COMPAGNIE, billet({ montant: 50_000 }));
    m.colis.ajouter(AUTRE_COMPAGNIE, colis({ montant: 50_000 }));
    m.caisses.ajouter(AUTRE_COMPAGNIE, JOUR, caisse({ ecart: -9_000 }));
    const r = await rapportDe(m, COMPAGNIE);
    expect(r.chiffres).toMatchObject({ billets: 0, colis: 0, recette: 0 });
    expect(r.gares.every((g) => g.ecart === 0)).toBe(true);
  });

  it("note la génération au journal d'audit, une seule fois, sans donnée sensible", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet());
    await m.service.generer(COMPAGNIE, JOUR);
    await m.service.generer(COMPAGNIE, JOUR);
    const lignes = m.auditRepo.lignes.filter((l) => l.action === "rapport.genere");
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      resultat: "succes",
      details: { compagnieId: COMPAGNIE, jour: JOUR, nbGares: 3, nbBillets: 1, incidents: [] },
    });
  });
});

describe("il part à 21 h, même si une caisse n'est pas validée", () => {
  it("le planificateur arrête le rapport à 21:00 avec la caisse non validée signalée", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet({ gareId: AKWA }), billet({ gareId: AKWA }));
    m.caisses.ajouter(
      COMPAGNIE,
      JOUR,
      caisse({ gareId: AKWA, guichetRang: 1 }),
      caisse({
        gareId: AKWA,
        guichetRang: 2,
        etat: "cloturee",
        ecart: -2_000,
        validation: null,
      }),
      caisse({
        gareId: AKWA,
        guichetRang: 3,
        etat: "ouverte",
        ecart: null,
        validation: null,
      }),
    );

    m.allerA(new Date(VINGT_ET_UNE_HEURES.getTime() - 60_000)); // 20:59
    expect(await m.planificateur.tick()).toEqual([]);
    expect(m.rapports.taille).toBe(0);

    m.allerA(VINGT_ET_UNE_HEURES); // 21:00
    expect(await m.planificateur.tick()).toEqual([COMPAGNIE, AUTRE_COMPAGNIE]);

    const r = (await m.service.lire(COMPAGNIE, JOUR))!;
    expect(r).not.toBeNull();
    const akwa = r.gares.find((g) => g.gareId === AKWA)!;
    expect(akwa.ecart).toBe(-2_000);
    expect(akwa.remarques).toEqual([
      "2 guichets clôturés sur 3",
      `guichet 2, caisse non validée (écart −${"2"}${F}000 F)`,
      "guichet 3, caisse encore ouverte",
    ]);
    expect(r.signatures).toEqual([{ nom: "Essono", gare: "Akwa" }]); // seule la caisse 1 est signée
  });

  it("n'attend pas la validation : le rapport reste celui de 21 h quand la caisse est validée à 22 h", async () => {
    const m = monterRapport();
    m.caisses.ajouter(
      COMPAGNIE,
      JOUR,
      caisse({ gareId: AKWA, etat: "cloturee", ecart: -2_000, validation: null }),
    );
    m.allerA(VINGT_ET_UNE_HEURES);
    await m.planificateur.tick();
    const avant = await m.service.lire(COMPAGNIE, JOUR);

    // à 22 h le superviseur valide : une nouvelle lecture des caisses verrait « validée », pas le rapport
    m.caisses.ajouter(COMPAGNIE, JOUR, caisse({ gareId: AKWA, guichetRang: 2 }));
    m.horloge.avancer(3_600_000);
    await m.planificateur.tick();
    expect(await m.service.lire(COMPAGNIE, JOUR)).toEqual(avant);
  });

  it("le planificateur est idempotent : un second passage, ou une autre instance, ne refait rien", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet());
    m.allerA(VINGT_ET_UNE_HEURES);
    expect(await m.planificateur.tick()).toHaveLength(2);
    expect(await m.planificateur.tick()).toEqual([]);

    // une autre instance (sans mémoire du planificateur) trouve les rapports déjà arrêtés
    const resume = await m.service.genererPourToutes(JOUR);
    expect(resume).toEqual({
      jour: JOUR,
      generes: [],
      dejaFaits: [COMPAGNIE, AUTRE_COMPAGNIE],
      echecs: [],
    });
    expect(m.rapports.taille).toBe(2);
    expect(m.auditRepo.lignes.filter((l) => l.action === "rapport.genere")).toHaveLength(2);
  });

  it("le lendemain, un nouveau rapport est arrêté à 21:00", async () => {
    const m = monterRapport();
    m.allerA(VINGT_ET_UNE_HEURES);
    await m.planificateur.tick();
    m.horloge.avancer(24 * 3_600_000);
    expect(await m.planificateur.tick()).toEqual([COMPAGNIE, AUTRE_COMPAGNIE]);
    expect(await m.service.lire(COMPAGNIE, "2027-01-06")).not.toBeNull();
    expect(m.rapports.taille).toBe(4);
  });

  it("un redémarrage en cours de soirée arrête quand même le rapport, une seule fois", async () => {
    const m = monterRapport();
    m.allerA(new Date("2027-01-05T21:40:00.000Z")); // 22:40 : l'API redémarre après 21 h
    expect(await m.planificateur.tick()).toHaveLength(2);
    const r = (await m.service.lire(COMPAGNIE, JOUR))!;
    expect(r.envoyeA).toBe("2027-01-05T22:40:00.000+01:00");
  });
});

describe("une source en panne ne bloque pas le rapport, une vente manquante oui", () => {
  it("part avec les sources complémentaires en panne, en le disant dans la première gare", async () => {
    const m = monterRapport();
    peuplerPlanche(m);
    m.caisses.enPanne = true;
    m.trous.enPanne = true;
    m.colis.enPanne = true;
    m.allerA(VINGT_ET_UNE_HEURES);
    const r = await rapportDe(m);

    expect(r.chiffres.billets).toBe(1_004);
    expect(r.chiffres.colis).toBe(0);
    expect(r.gares[0]!.remarques).toEqual(
      expect.arrayContaining([
        "caisses : données indisponibles",
        "colis : données indisponibles",
        "litiges : données indisponibles",
        "numérotation : données indisponibles",
      ]),
    );
    expect(r.signatures).toEqual([]);
    const audit = m.auditRepo.lignes.find((l) => l.action === "rapport.genere")!;
    expect((audit.details as { incidents: string[] }).incidents).toHaveLength(4);
  });

  it("ne part pas sans ses ventes de billets : rien n'est écrit, le passage suivant réessaie", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet({ montant: 3_500 }));
    m.ventes.enPanne = true;
    m.allerA(VINGT_ET_UNE_HEURES);

    expect(await m.planificateur.tick()).toEqual([]);
    expect(m.rapports.taille).toBe(0);
    const echecs = m.auditRepo.lignes.filter(
      (l) => l.action === "rapport.genere" && l.resultat === "echec",
    );
    expect(echecs).toHaveLength(2);

    m.ventes.enPanne = false;
    m.horloge.avancer(30_000);
    expect(await m.planificateur.tick()).toHaveLength(2);
    expect((await m.service.lire(COMPAGNIE, JOUR))!.chiffres.recette).toBe(3_500);
  });

  it("une panne du référentiel ne fait pas de rapport faux", async () => {
    const m = monterRapport();
    m.referentiel.enPanne = true;
    await expect(m.service.generer(COMPAGNIE, JOUR)).rejects.toThrow("Source indisponible");
    expect(m.rapports.taille).toBe(0);
  });

  it("un planificateur dont une compagnie échoue sert quand même les autres", async () => {
    const m = monterRapport();
    const lire = m.ventes.duJour.bind(m.ventes);
    m.ventes.duJour = async (compagnieId, jour) => {
      if (compagnieId === COMPAGNIE) throw new Error("base indisponible");
      return lire(compagnieId, jour);
    };
    m.allerA(VINGT_ET_UNE_HEURES);
    expect(await m.planificateur.tick()).toEqual([AUTRE_COMPAGNIE]);
    expect(await m.service.lire(COMPAGNIE, JOUR)).toBeNull();
    expect(await m.service.lire(AUTRE_COMPAGNIE, JOUR)).not.toBeNull();
  });
});

describe("la question suggérée par l'assistant", () => {
  it("l'assistant reçoit le départ le moins rempli et sa réponse part dans le rapport", async () => {
    const contextes: unknown[] = [];
    const assistant = new (class extends AssistantRapport {
      async suggerer(contexte: Parameters<AssistantRapport["suggerer"]>[0]) {
        contextes.push(contexte);
        return {
          question: `Pourquoi le ${contexte.departFaible?.heure} part si vide ?`,
          reponse: "Trois jours de suite à 55 %.",
        };
      }
    })();
    const m = monterRapport({ assistant });
    m.departs.ajouter(COMPAGNIE, JOUR, depart({ heure: "09:30", vendus: 22 }));
    const r = await rapportDe(m);
    expect(contextes).toEqual([
      {
        compagnieId: COMPAGNIE,
        jour: JOUR,
        departFaible: { heure: "09:30", remplissagePct: 55 },
      },
    ]);
    expect(r.questionSuggeree).toEqual({
      question: "Pourquoi le 09:30 part si vide ?",
      reponse: "Trois jours de suite à 55 %.",
    });
  });

  it("un assistant en panne ne retarde pas le rapport et ne laisse pas de trace dans les remarques", async () => {
    const assistant = new (class extends AssistantRapport {
      async suggerer(): Promise<never> {
        throw new Error("assistant hors service");
      }
    })();
    const m = monterRapport({ assistant });
    m.ventes.ajouter(COMPAGNIE, billet());
    const r = await rapportDe(m);
    expect(r.questionSuggeree).toEqual({ question: "", reponse: "" });
    expect(r.gares.flatMap((g) => g.remarques)).toEqual([]);
  });
});

describe("le rapport dans l'application", () => {
  it("n'est pas dû avant 21 h : le jour par défaut est alors celui d'hier", async () => {
    const m = monterRapport(); // 08:00
    expect(m.service.jourParDefaut()).toBe("2027-01-04");
    expect(m.service.estDu(JOUR)).toBe(false);
    await expect(m.service.pourLApp(COMPAGNIE, JOUR)).rejects.toBeInstanceOf(RapportPasEncore);
  });

  it("à partir de 21 h, le jour par défaut est aujourd'hui, et le rapport est arrêté à la demande", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet({ montant: 3_500 }));
    m.allerA(VINGT_ET_UNE_HEURES);
    expect(m.service.jourParDefaut()).toBe(JOUR);
    expect(m.service.estDu(JOUR)).toBe(true);
    const r = await m.service.pourLApp(COMPAGNIE);
    expect(r.jour).toBe(JOUR);
    expect(r.chiffres.recette).toBe(3_500);
    expect(m.rapports.taille).toBe(1);
  });

  it("rend le rapport déjà arrêté, même avant l'heure du lendemain", async () => {
    const m = monterRapport();
    m.ventes.ajouter(COMPAGNIE, billet({ montant: 3_500 }));
    m.allerA(VINGT_ET_UNE_HEURES);
    await m.planificateur.tick();
    m.ventes.ajouter(COMPAGNIE, billet({ montant: 1_000 }));
    m.horloge.avancer(11 * 3_600_000); // le lendemain à 08:00
    expect(m.service.jourParDefaut()).toBe(JOUR);
    expect((await m.service.pourLApp(COMPAGNIE, JOUR)).chiffres.recette).toBe(3_500);
  });

  it("refuse un jour futur et un jour trop ancien", async () => {
    const m = monterRapport();
    m.allerA(VINGT_ET_UNE_HEURES);
    await expect(m.service.pourLApp(COMPAGNIE, "2027-01-06")).rejects.toBeInstanceOf(
      RapportPasEncore,
    );
    await expect(m.service.pourLApp(COMPAGNIE, "2026-11-01")).rejects.toBeInstanceOf(
      RapportIntrouvable,
    );
    // dans la limite de l'historique, un jour passé est reconstitué
    expect((await m.service.pourLApp(COMPAGNIE, "2026-12-20")).jour).toBe("2026-12-20");
  });

  it("pour l'envoi WhatsApp, ce qui n'est pas dû ou introuvable devient « pas de rapport »", async () => {
    const m = monterRapport();
    expect(await m.service.pourEnvoi(COMPAGNIE, JOUR)).toBeNull(); // 08:00
    expect(await m.service.pourEnvoi("inconnue", "2027-01-04")).toBeNull();
    expect(await m.service.pourEnvoi(COMPAGNIE, "2027-01-04")).not.toBeNull();
    m.ventes.enPanne = true;
    await expect(m.service.pourEnvoi(COMPAGNIE, "2027-01-03")).rejects.toThrow(); // une vraie panne remonte
  });
});
