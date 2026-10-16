import { describe, expect, it } from "vitest";
import {
  analyserNumeroBillet,
  analyserNumeroColis,
  analyserSequences,
  formaterSequence,
  GenerateurNumeros,
  numeroBillet,
  numeroColis,
  numeroDepart,
  numeroSession,
  PLAGE_EN_LIGNE,
  plageConvoyeur,
  plageGuichet,
  PlageEpuisee,
} from "./numerotation";
import type { Plage } from "./numerotation";
import { aammjjDouala, ajouterJours, ajouterMinutes } from "./temps";
import { aleaGraine } from "./testing/alea";

const DEBUT_JOURNEE = "2027-01-05T05:00:00+01:00";

describe("formats de numéros", () => {
  it("billet : AGENCE-GARE-AAMMJJ-NNNN", () => {
    expect(
      numeroBillet({ agence: "ALP", gare: "DLA", at: "2027-01-05T05:14:52+01:00", sequence: 232 }),
    ).toBe("ALP-DLA-270105-0232");
  });

  it("colis : C-GARE-AAMMJJ-NNNN", () => {
    expect(numeroColis({ gare: "DLA", at: "2027-01-05T13:05:00+01:00", sequence: 17 })).toBe(
      "C-DLA-270105-0017",
    );
  });

  it("départ : AGENCE-LIGNE-AAMMJJ-HHMM", () => {
    expect(numeroDepart({ agence: "ALP", ligne: "DLAYDE", at: "2027-01-05T05:30:00+01:00" })).toBe(
      "ALP-DLAYDE-270105-0530",
    );
  });

  it("session : K-GARE-AAMMJJ-GUICHET-N", () => {
    expect(
      numeroSession({ gare: "DLA", at: "2027-01-05T05:02:00+01:00", guichetRang: 2, ordre: 1 }),
    ).toBe("K-DLA-270105-2-1");
  });

  it("date prise en heure de Douala, pas en UTC", () => {
    // 23:30 UTC le 4 janvier = 00:30 à Douala le 5 janvier.
    expect(numeroColis({ gare: "DLA", at: "2027-01-04T23:30:00Z", sequence: 1 })).toBe(
      "C-DLA-270105-0001",
    );
    expect(aammjjDouala("2027-01-05T23:30:00Z")).toBe("270106");
  });

  it("refuse les séquences hors 0001–9999 et les codes invalides", () => {
    expect(() => formaterSequence(0)).toThrow(RangeError);
    expect(() => formaterSequence(10_000)).toThrow(RangeError);
    expect(() => numeroBillet({ agence: "a-b", gare: "DLA", at: 0, sequence: 1 })).toThrow(
      RangeError,
    );
  });

  it("relit un numéro de billet ou de colis", () => {
    expect(analyserNumeroBillet("ALP-DLA-270105-0232")).toEqual({
      agence: "ALP",
      gare: "DLA",
      aammjj: "270105",
      sequence: 232,
    });
    expect(analyserNumeroBillet("C-DLA-270105-0017")).toBeNull();
    expect(analyserNumeroColis("C-DLA-270105-0017")).toEqual({
      gare: "DLA",
      aammjj: "270105",
      sequence: 17,
    });
  });
});

describe("plages", () => {
  it("guichet 1 : 0001–0999, guichet 2 : 1001–1999, guichet 3 : 2001–2999", () => {
    expect(plageGuichet(1)).toEqual({ debut: 1, fin: 999 });
    expect(plageGuichet(2)).toEqual({ debut: 1001, fin: 1999 });
    expect(plageGuichet(3)).toEqual({ debut: 2001, fin: 2999 });
    expect(() => plageGuichet(0)).toThrow(RangeError);
    expect(() => plageGuichet(4)).toThrow(RangeError);
  });

  it("convoyeurs : 3xxx, parts disjointes", () => {
    const parts = [1, 2, 3, 4, 5, 6, 7].map((rang) => plageConvoyeur(rang, 7));
    for (const p of parts) {
      expect(p.debut).toBeGreaterThanOrEqual(3001);
      expect(p.fin).toBeLessThanOrEqual(3999);
      expect(p.fin).toBeGreaterThanOrEqual(p.debut);
    }
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i]!.debut).toBeGreaterThan(parts[i - 1]!.fin);
    }
  });

  it("toutes les plages sont disjointes", () => {
    const plages: Plage[] = [
      plageGuichet(1),
      plageGuichet(2),
      plageGuichet(3),
      plageConvoyeur(1, 1),
      PLAGE_EN_LIGNE,
    ];
    for (let i = 0; i < plages.length; i++) {
      for (let j = i + 1; j < plages.length; j++) {
        const a = plages[i]!;
        const b = plages[j]!;
        expect(a.fin < b.debut || b.fin < a.debut).toBe(true);
      }
    }
  });
});

describe("générateur d'un appareil", () => {
  it("numérote dans l'ordre depuis le début de la plage, un compteur par jour", () => {
    const g = new GenerateurNumeros({ agence: "ALP", gare: "DLA", plage: plageGuichet(2) });
    expect(g.prochainBillet(DEBUT_JOURNEE).numero).toBe("ALP-DLA-270105-1001");
    expect(g.prochainBillet(DEBUT_JOURNEE).numero).toBe("ALP-DLA-270105-1002");
    expect(g.prochainColis(DEBUT_JOURNEE).numero).toBe("C-DLA-270105-1001");
    expect(g.prochainBillet(ajouterJours(DEBUT_JOURNEE, 1)).numero).toBe("ALP-DLA-270106-1001");
  });

  it("le compteur bascule au changement de jour de Douala (minuit local)", () => {
    const g = new GenerateurNumeros({ agence: "ALP", gare: "DLA", plage: plageGuichet(1) });
    expect(g.prochainBillet("2027-01-05T23:59:59+01:00").numero).toBe("ALP-DLA-270105-0001");
    expect(g.prochainBillet("2027-01-06T00:00:00+01:00").numero).toBe("ALP-DLA-270106-0001");
  });

  it("numérote les sessions de caisse du jour : 1, 2, 3…", () => {
    const g = new GenerateurNumeros({ agence: "ALP", gare: "DLA", plage: plageGuichet(2) });
    expect(g.prochaineSession(DEBUT_JOURNEE, 2)).toBe("K-DLA-270105-2-1");
    expect(g.prochaineSession(DEBUT_JOURNEE, 2)).toBe("K-DLA-270105-2-2");
  });

  it("lève PlageEpuisee après 999 ventes dans la journée, sans rien sauter", () => {
    const g = new GenerateurNumeros({ agence: "ALP", gare: "DLA", plage: plageGuichet(1) });
    const sequences: number[] = [];
    for (let i = 0; i < 999; i++) sequences.push(g.prochainBillet(DEBUT_JOURNEE).sequence);
    expect(g.billetsRestants(DEBUT_JOURNEE)).toBe(0);
    expect(() => g.prochainBillet(DEBUT_JOURNEE)).toThrow(PlageEpuisee);
    expect(sequences[0]).toBe(1);
    expect(sequences[998]).toBe(999);
    expect(analyserSequences(sequences, plageGuichet(1)).trous).toEqual([]);
    // Le lendemain, la plage est de nouveau entière.
    expect(g.prochainBillet(ajouterJours(DEBUT_JOURNEE, 1)).sequence).toBe(1);
  });

  it("reprend sans trou ni doublon après un redémarrage (état exporté puis restauré)", () => {
    const options = { agence: "ALP", gare: "DLA", plage: plageGuichet(1) };
    const avant = new GenerateurNumeros(options);
    avant.prochainBillet(DEBUT_JOURNEE);
    avant.prochainBillet(DEBUT_JOURNEE);
    const apres = new GenerateurNumeros({
      ...options,
      etat: JSON.parse(JSON.stringify(avant.exporter())),
    });
    expect(apres.prochainBillet(DEBUT_JOURNEE).sequence).toBe(3);
  });

  it("un convoyeur peut vendre dans une autre gare avec le même compteur de plage", () => {
    const g = new GenerateurNumeros({
      agence: "ALP",
      gare: "DLA",
      plage: plageConvoyeur(1, 7),
    });
    const a = g.prochainBillet(DEBUT_JOURNEE);
    const b = g.prochainBillet(DEBUT_JOURNEE, "PMA");
    expect(b.sequence).toBe(a.sequence + 1);
    expect(b.numero).toBe(`ALP-PMA-270105-${String(a.sequence + 1).padStart(4, "0")}`);
  });
});

describe("analyse des trous (côté serveur)", () => {
  it("repère un trou, un doublon et un numéro hors plage", () => {
    const plage = plageGuichet(1);
    expect(analyserSequences([1, 2, 3, 5, 5, 1500], plage)).toEqual({
      trous: [4],
      doublons: [5],
      horsPlage: [1500],
    });
  });

  it("une plage vide ou complète n'a pas de trou", () => {
    expect(analyserSequences([], plageGuichet(1)).trous).toEqual([]);
    expect(analyserSequences([1, 2, 3], plageGuichet(1)).trous).toEqual([]);
  });

  it("un trou au début de la plage est détecté", () => {
    expect(analyserSequences([2, 3], plageGuichet(1)).trous).toEqual([1]);
  });
});

describe("10 000 ventes hors ligne réparties sur 3 guichets", () => {
  const AGENCE = "ALP";
  const GARE = "DLA";
  const NB_VENTES = 10_000;
  const NB_JOURS = 5;
  const VENTES_PAR_JOUR = NB_VENTES / NB_JOURS;
  const GUICHETS = [1, 2, 3] as const;

  /**
   * Chaque guichet a son propre générateur, sans aucune communication entre eux (hors ligne).
   * Une plage fait 999 numéros par jour et par guichet : 10 000 ventes tiennent donc sur 5 jours
   * de 2 000 ventes (≈ 667 par guichet et par jour). Les ventes sont entremêlées au hasard et chaque
   * guichet redémarre (état restauré depuis le disque) toutes les 150 ventes.
   */
  function simuler(graine: number) {
    const alea = aleaGraine(graine);
    const generateurs = new Map(
      GUICHETS.map((rang) => [
        rang,
        new GenerateurNumeros({ agence: AGENCE, gare: GARE, plage: plageGuichet(rang) }),
      ]),
    );
    const ventes: {
      rang: number;
      numero: string;
      sequence: number;
      jour: number;
      annule: boolean;
    }[] = [];
    let compteurRedemarrage = 0;
    for (let jour = 0; jour < NB_JOURS; jour++) {
      for (let i = 0; i < VENTES_PAR_JOUR; i++) {
        const rang = GUICHETS[Math.floor(alea() * GUICHETS.length)]!;
        const instant = ajouterMinutes(ajouterJours(DEBUT_JOURNEE, jour), Math.floor(alea() * 600));
        const g = generateurs.get(rang)!;
        const pris = g.prochainBillet(instant);
        ventes.push({ rang, ...pris, jour, annule: alea() < 0.03 });
        if (++compteurRedemarrage % 150 === 0) {
          generateurs.set(
            rang,
            new GenerateurNumeros({
              agence: AGENCE,
              gare: GARE,
              plage: plageGuichet(rang),
              etat: JSON.parse(JSON.stringify(g.exporter())),
            }),
          );
        }
      }
    }
    return ventes;
  }

  const ventes = simuler(2027);

  it("fait bien 10 000 ventes sur 3 guichets, chacun en ayant fait", () => {
    expect(ventes).toHaveLength(NB_VENTES);
    for (const rang of GUICHETS) {
      expect(ventes.filter((v) => v.rang === rang).length).toBeGreaterThan(2000);
    }
  });

  it("aucun doublon : 10 000 numéros complets distincts", () => {
    expect(new Set(ventes.map((v) => v.numero)).size).toBe(NB_VENTES);
  });

  it("aucun trou : chaque guichet occupe sa plage sans interruption, chaque jour", () => {
    for (let jour = 0; jour < NB_JOURS; jour++) {
      for (const rang of GUICHETS) {
        const plage = plageGuichet(rang);
        const sequences = ventes
          .filter((v) => v.jour === jour && v.rang === rang)
          .map((v) => v.sequence);
        expect(sequences.length).toBeGreaterThan(0);
        const analyse = analyserSequences(sequences, plage);
        expect(analyse, `jour ${jour} guichet ${rang}`).toEqual({
          trous: [],
          doublons: [],
          horsPlage: [],
        });
        // Contigu depuis le début de la plage : debut, debut+1, …, debut+n-1.
        const tries = [...sequences].sort((a, b) => a - b);
        expect(tries[0]).toBe(plage.debut);
        expect(tries[tries.length - 1]).toBe(plage.debut + tries.length - 1);
      }
    }
  });

  it("aucun trou non plus sur la journée entière de la gare (union des 3 plages)", () => {
    for (let jour = 0; jour < NB_JOURS; jour++) {
      const duJour = ventes.filter((v) => v.jour === jour);
      const parNumero = new Set(duJour.map((v) => v.numero));
      expect(parNumero.size).toBe(duJour.length);
      for (const rang of GUICHETS) {
        const n = duJour.filter((v) => v.rang === rang).length;
        const plage = plageGuichet(rang);
        for (let k = 0; k < n; k++) {
          const attendu = numeroBillet({
            agence: AGENCE,
            gare: GARE,
            at: ajouterJours(DEBUT_JOURNEE, jour),
            sequence: plage.debut + k,
          });
          expect(parNumero.has(attendu), attendu).toBe(true);
        }
      }
    }
  });

  it("les billets annulés gardent leur numéro : les compter ne crée pas de trou", () => {
    const annules = ventes.filter((v) => v.annule);
    expect(annules.length).toBeGreaterThan(100);
    // Même sans eux, les numéros restent présents dans la liste complète.
    const sansAnnules = ventes.filter((v) => !v.annule);
    const rang = 1;
    const sequences = sansAnnules
      .filter((v) => v.jour === 0 && v.rang === rang)
      .map((v) => v.sequence);
    const trousSiOnLesEfface = analyserSequences(sequences, plageGuichet(rang)).trous;
    expect(trousSiOnLesEfface.length).toBeGreaterThan(0);
    const toutes = ventes.filter((v) => v.jour === 0 && v.rang === rang).map((v) => v.sequence);
    expect(analyserSequences(toutes, plageGuichet(rang)).trous).toEqual([]);
  });

  it("chaque numéro appartient à la plage de son guichet et se relit", () => {
    for (const v of ventes) {
      const plage = plageGuichet(v.rang);
      expect(v.sequence).toBeGreaterThanOrEqual(plage.debut);
      expect(v.sequence).toBeLessThanOrEqual(plage.fin);
      expect(analyserNumeroBillet(v.numero)?.sequence).toBe(v.sequence);
    }
  });

  it("le résultat ne dépend pas de l'ordre d'arrivée des guichets (autre graine)", () => {
    const autres = simuler(99);
    expect(new Set(autres.map((v) => v.numero)).size).toBe(NB_VENTES);
  });
});
