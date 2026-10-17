import { describe, expect, it } from "vitest";
import { codeVille, dateCourte, dureeTrajet, heureDouala, montantFcfa } from "./formats";

describe("formats du billet", () => {
  it("lit l'heure et la date dans l'ISO de Douala, sans conversion de fuseau", () => {
    expect(heureDouala("2027-01-05T08:00:00.000+01:00")).toBe("08:00");
    expect(heureDouala("2027-01-05T23:59:00.000+01:00")).toBe("23:59");
    expect(dateCourte("2027-01-05T08:00:00.000+01:00")).toBe("05.01");
    expect(dateCourte("2027-12-31T00:05:00.000+01:00")).toBe("31.12");
  });

  it("rend une chaîne vide plutôt qu'une valeur fausse pour un texte illisible", () => {
    expect(heureDouala("bientôt")).toBe("");
    expect(dateCourte("bientôt")).toBe("");
  });

  it("écrit la durée comme la maquette", () => {
    expect(dureeTrajet(210)).toBe("3 h 30");
    expect(dureeTrajet(185)).toBe("3 h 05");
    expect(dureeTrajet(180)).toBe("3 h");
    expect(dureeTrajet(45)).toBe("45 min");
  });

  it("écrit les montants en FCFA avec des espaces simples", () => {
    expect(montantFcfa(700)).toBe("700 F");
    expect(montantFcfa(7500)).toBe("7 500 F");
    expect(montantFcfa(1250000)).toBe("1 250 000 F");
  });

  it("garde le code de la gare, sinon trois lettres de la ville", () => {
    expect(codeVille({ code: "DLA", nom: "Douala" })).toBe("DLA");
    expect(codeVille({ nom: "Yaoundé" })).toBe("YAO");
    expect(codeVille({ code: "", nom: "Ébolowa" })).toBe("EBO");
  });
});
