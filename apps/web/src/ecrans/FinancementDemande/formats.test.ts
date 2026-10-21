import { describe, expect, it } from "vitest";
import { groupes, heuresDeReponse, montantCourt, morceauxRang, taux } from "./formats";

describe("groupes", () => {
  it("sépare les milliers par une espace", () => {
    expect(groupes(6_000_000)).toBe("6 000 000");
    expect(groupes(999)).toBe("999");
    expect(groupes(1_234)).toBe("1 234");
  });
});

describe("montantCourt", () => {
  it("abrège en millions, en milliers, sans zéro inutile", () => {
    expect(montantCourt(6_000_000)).toBe("6 M");
    expect(montantCourt(1_500_000)).toBe("1,5 M");
    expect(montantCourt(250_000)).toBe("250 k");
    expect(montantCourt(950)).toBe("950");
  });
});

describe("taux", () => {
  it("écrit la virgule décimale", () => {
    expect(taux(12)).toBe("12");
    expect(taux(12.5)).toBe("12,5");
  });
});

describe("heuresDeReponse", () => {
  it("compte les heures entre l'envoi et la réponse promise", () => {
    expect(heuresDeReponse("2027-01-05T10:04:00.000+01:00", "2027-01-06T10:04:00.000+01:00")).toBe(
      24,
    );
    expect(heuresDeReponse("2027-01-05T10:04:00.000+01:00", "2027-01-07T10:04:00.000+01:00")).toBe(
      48,
    );
  });

  it("ne descend jamais sous une heure et retombe sur 24 h si une date est illisible", () => {
    expect(heuresDeReponse("2027-01-05T10:04:00.000+01:00", "2027-01-05T10:04:00.000+01:00")).toBe(
      1,
    );
    expect(heuresDeReponse("n'importe quoi", "2027-01-05T10:04:00.000+01:00")).toBe(24);
  });
});

describe("morceauxRang", () => {
  it("met le rang en exposant", () => {
    expect(morceauxRang("démarre au 1er billet")).toEqual([
      { texte: "démarre au 1" },
      { exposant: "er" },
      { texte: " billet" },
    ]);
  });

  it("laisse intacts les textes sans rang", () => {
    expect(morceauxRang("le 8 % démarre à 10:04")).toEqual([{ texte: "le 8 % démarre à 10:04" }]);
  });
});
