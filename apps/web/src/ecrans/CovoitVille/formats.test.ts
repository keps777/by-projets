import type { voyageur as c } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  departImminent,
  estRegulier,
  formaterMontant,
  formaterNote,
  heureDouala,
  initiales,
  mentionOffre,
  titreOffre,
  tonDuRang,
  type TextesOffre,
} from "./formats";

const TEXTES: TextesOffre = {
  verifie: "vérifié",
  regulier: "régulier",
  dans: (n) => `dans ${n} min`,
  minutes: (n) => `${n} min`,
  motoTaxi: "moto-taxi",
};

function offre(reste: Partial<c.OffreVille> = {}): c.OffreVille {
  return {
    id: "o1",
    type: "covoiturage",
    departA: "2027-01-05T07:41:00.000+01:00",
    departDansMinutes: 3,
    qui: "Clarisse",
    verifie: false,
    detail: "Hyundai · 3 places",
    prix: 700,
    ...reste,
  };
}

describe("CovoitVille · formats", () => {
  it("lit l'heure de Douala dans l'ISO de l'API, sans la décaler", () => {
    expect(heureDouala("2027-01-05T08:00:00.000+01:00")).toBe("08:00");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("sépare les milliers par une espace et arrondit", () => {
    expect(formaterMontant(700)).toBe("700");
    expect(formaterMontant(1000)).toBe("1 000");
    expect(formaterMontant(12500.4)).toBe("12 500");
  });

  it("écrit la note avec une virgule et une étoile", () => {
    expect(formaterNote(4.9)).toBe("4,9 ★");
    expect(formaterNote(5)).toBe("5,0 ★");
  });

  it("tire les initiales du nom : deux lettres d'un prénom, une par partie d'un nom composé", () => {
    expect(initiales("Clarisse")).toBe("CL");
    expect(initiales("Jean-Marc")).toBe("JM");
    expect(initiales("Samuel E.")).toBe("SE");
    expect(initiales("paul")).toBe("PA");
    expect(initiales("")).toBe("");
  });

  it("alterne vert, bleu, ambre selon le rang", () => {
    expect([0, 1, 2, 3, 4].map(tonDuRang)).toEqual(["vert", "bleu", "ambre", "vert", "bleu"]);
  });

  it("annonce un délai jusqu'à 10 minutes, une heure au-delà", () => {
    expect(departImminent({ departDansMinutes: 10 })).toBe(true);
    expect(departImminent({ departDansMinutes: 11 })).toBe(false);
  });

  it("reconnaît un trajet régulier à son détail", () => {
    expect(estRegulier({ detail: "chaque matin · Toyota · 2 places" })).toBe(true);
    expect(estRegulier({ detail: "Hyundai · chaque matin" })).toBe(false);
  });

  describe("titreOffre", () => {
    it("covoiturage imminent : « dans 3 min »", () => {
      expect(titreOffre(offre(), TEXTES)).toBe("Clarisse · dans 3 min");
    });

    it("covoiturage plus tard : l'heure de départ", () => {
      const o = offre({
        qui: "Jean-Marc",
        departA: "2027-01-05T08:00:00.000+01:00",
        departDansMinutes: 22,
      });
      expect(titreOffre(o, TEXTES)).toBe("Jean-Marc · 08:00");
    });

    it("moto-taxi : le type puis la durée d'attente, même au-delà de 10 minutes", () => {
      const o = offre({ type: "moto_taxi", qui: "Paul", departDansMinutes: 5 });
      expect(titreOffre(o, TEXTES)).toBe("Paul · moto-taxi · 5 min");
      expect(titreOffre({ ...o, departDansMinutes: 25 }, TEXTES)).toBe("Paul · moto-taxi · 25 min");
    });
  });

  describe("mentionOffre", () => {
    it("vérifié et noté", () => {
      expect(mentionOffre(offre({ verifie: true, note: 4.9 }), TEXTES)).toBe("· vérifié · 4,9 ★");
    });

    it("régulier et noté", () => {
      const o = offre({ detail: "chaque matin · Toyota", note: 4.8 });
      expect(mentionOffre(o, TEXTES)).toBe("· régulier · 4,8 ★");
    });

    it("rien à dire : aucune mention (pas de « · » seul)", () => {
      expect(mentionOffre(offre(), TEXTES)).toBe("");
    });

    it("prend le texte « vérifiée » donné pour une conductrice", () => {
      expect(mentionOffre(offre({ verifie: true }), { ...TEXTES, verifie: "vérifiée" })).toBe(
        "· vérifiée",
      );
    });
  });
});
