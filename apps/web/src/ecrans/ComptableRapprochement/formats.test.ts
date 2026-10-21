import type { patron } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  decompte,
  instantCourt,
  lignesOuvertes,
  milliers,
  nomDuMois,
  pourcentage,
  segmentsExplication,
  tonDeLaCause,
  totalATraiter,
} from "./formats";

type Ligne = patron.TransactionSansCorrespondance;

function ligne(surcharge: Partial<Ligne> = {}): Ligne {
  return {
    reference: "MP261203.1142.A71290",
    recueA: "2026-12-03T11:42:00.000+01:00",
    telephoneMasque: "6 77 •• •• 41",
    operateur: "mtn",
    montant: 4000,
    cause: "doublon_paiement",
    explication: "Probable : doublon",
    actionProposee: "rembourser",
    cibleSuggeree: null,
    decision: null,
    ...surcharge,
  };
}

describe("milliers", () => {
  it("groupe par trois chiffres avec une espace, comme la planche", () => {
    expect(milliers(16_000)).toBe("16 000");
    expect(milliers(1912)).toBe("1 912");
    expect(milliers(4000)).toBe("4 000");
    expect(milliers(950)).toBe("950");
    expect(milliers(0)).toBe("0");
  });

  it("écrit un montant négatif avec le vrai signe moins", () => {
    expect(milliers(-1000)).toBe("− 1 000");
  });
});

describe("instantCourt", () => {
  it("écrit le jour, le mois abrégé et l'heure de Douala tels que l'API les donne", () => {
    expect(instantCourt("2026-12-03T11:42:00.000+01:00")).toBe("3 déc. 11:42");
    expect(instantCourt("2026-12-09T06:58:00+01:00")).toBe("9 déc. 06:58");
    expect(instantCourt("2026-12-28T14:05:00.000+01:00")).toBe("28 déc. 14:05");
  });

  it("abrège chaque mois comme le français", () => {
    const attendus = [
      "janv.",
      "févr.",
      "mars",
      "avr.",
      "mai",
      "juin",
      "juil.",
      "août",
      "sept.",
      "oct.",
      "nov.",
      "déc.",
    ];
    attendus.forEach((mois, i) => {
      const numero = String(i + 1).padStart(2, "0");
      expect(instantCourt(`2026-${numero}-15T09:05:00.000+01:00`)).toBe(`15 ${mois} 09:05`);
    });
  });

  it("rend un texte illisible tel quel plutôt que d'inventer une date", () => {
    expect(instantCourt("hier")).toBe("hier");
    expect(instantCourt("2026-13-03T11:42:00.000+01:00")).toBe("2026-13-03T11:42:00.000+01:00");
  });
});

describe("pourcentage", () => {
  it("écrit la virgule française et au plus une décimale", () => {
    expect(pourcentage(0.2)).toBe("0,2 %");
    expect(pourcentage(5)).toBe("5 %");
    expect(pourcentage(0.209)).toBe("0,2 %");
    expect(pourcentage(12.34)).toBe("12,3 %");
  });
});

describe("nomDuMois", () => {
  it("garde le nom du mois, sans l'année", () => {
    expect(nomDuMois("Décembre 2026")).toBe("Décembre");
    expect(nomDuMois("Décembre")).toBe("Décembre");
  });
});

describe("lignes ouvertes, total et décompte", () => {
  const lignes = [
    ligne({ reference: "A", montant: 4000, actionProposee: "rembourser" }),
    ligne({ reference: "B", montant: 4000, actionProposee: "rembourser" }),
    ligne({ reference: "C", montant: 5000, actionProposee: "rattacher" }),
    ligne({ reference: "D", montant: 3000, actionProposee: "demander" }),
  ];

  it("tant qu'aucune décision n'est appliquée, les quatre lignes sont ouvertes : 16 000", () => {
    expect(lignesOuvertes(lignes).map((l) => l.reference)).toEqual(["A", "B", "C", "D"]);
    expect(totalATraiter(lignes)).toBe(16_000);
  });

  it("compte les actions proposées : 2 remboursements, 1 rattachement, 1 réclamation", () => {
    expect(decompte(lignes)).toEqual({ rembourser: 2, rattacher: 1, demander: 1 });
  });

  it("une ligne déjà décidée n'est plus ouverte : elle sort du total et du décompte", () => {
    const apres = lignes.map((l) =>
      l.reference === "A" ? { ...l, decision: "rembourser" as const } : l,
    );
    expect(lignesOuvertes(apres).map((l) => l.reference)).toEqual(["B", "C", "D"]);
    expect(totalATraiter(apres)).toBe(12_000);
    expect(decompte(apres)).toEqual({ rembourser: 1, rattacher: 1, demander: 1 });
  });

  it("sans ligne ouverte : zéro partout", () => {
    const toutes = lignes.map((l) => ({ ...l, decision: l.actionProposee }));
    expect(lignesOuvertes(toutes)).toEqual([]);
    expect(totalATraiter(toutes)).toBe(0);
    expect(decompte(toutes)).toEqual({ rembourser: 0, rattacher: 0, demander: 0 });
  });
});

describe("segmentsExplication", () => {
  it("met « 2e » et « 1er » en exposant, comme la planche", () => {
    expect(
      segmentsExplication("billet payé 2 fois, 2e paiement 40 s après le 1er (réseau)"),
    ).toEqual([
      { texte: "billet payé 2 fois, " },
      { texte: "2", exposant: "e" },
      { texte: " paiement 40 s après le " },
      { texte: "1", exposant: "er" },
      { texte: " (réseau)" },
    ]);
  });

  it("laisse intacts les nombres, les heures et les références", () => {
    const texte = "billet DLA → BAF 10:00 · expiration (15 min) · colis C-ALP-DLA-261217-0141";
    expect(segmentsExplication(texte)).toEqual([{ texte }]);
  });

  it("un texte vide ne donne aucun segment", () => {
    expect(segmentsExplication("")).toEqual([]);
  });
});

describe("tonDeLaCause", () => {
  it("vert quand la cause est établie, bleu quand il faut rattacher, rouge quand elle est inconnue", () => {
    expect(tonDeLaCause("doublon_paiement")).toBe("vert");
    expect(tonDeLaCause("paiement_apres_expiration")).toBe("vert");
    expect(tonDeLaCause("scan_depot_manquant")).toBe("bleu");
    expect(tonDeLaCause("inconnue")).toBe("rouge");
  });
});
