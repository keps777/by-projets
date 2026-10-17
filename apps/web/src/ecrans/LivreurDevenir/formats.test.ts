import { describe, expect, it } from "vitest";
import {
  abreger,
  decouperRegles,
  deplacementDe,
  formaterNombre,
  neufChiffres,
  operateurDe,
  pieceMotoDe,
} from "./formats";

describe("formaterNombre", () => {
  it("met une espace entre les milliers", () => {
    expect(formaterNombre(86)).toBe("86");
    expect(formaterNombre(700)).toBe("700");
    expect(formaterNombre(12500)).toBe("12 500");
  });
});

describe("abreger", () => {
  it("écrit les milliers en « k », comme la planche (31 k)", () => {
    expect(abreger(31000)).toBe("31 k");
    expect(abreger(31500)).toBe("31,5 k");
    expect(abreger(1000)).toBe("1 k");
    expect(abreger(800)).toBe("800");
  });
});

describe("deplacementDe", () => {
  it("lit le moyen dans le libellé de la planche, accents et suite comprises", () => {
    expect(deplacementDe("Moto")).toBe("moto");
    expect(deplacementDe("Vélo")).toBe("velo");
    expect(deplacementDe("À pied")).toBe("pied");
    expect(deplacementDe("Tricycle · gros colis")).toBe("tricycle");
    expect(deplacementDe("Trottinette")).toBeNull();
  });
});

describe("pieceMotoDe", () => {
  it("ne reconnaît que le permis et l'assurance (la CNI se demande toujours, et est déjà vérifiée)", () => {
    expect(pieceMotoDe("Permis A")).toBe("permis");
    expect(pieceMotoDe("Assurance moto")).toBe("assurance");
    expect(pieceMotoDe("CNI")).toBeNull();
  });
});

describe("neufChiffres", () => {
  it("lit un numéro camerounais complet, avec ou sans indicatif et séparateurs", () => {
    expect(neufChiffres("6 75 12 34 09")).toBe("675123409");
    expect(neufChiffres("+237 675 12 34 09")).toBe("675123409");
    expect(neufChiffres("675123409 · MTN")).toBe("675123409");
  });

  it("refuse un numéro incomplet, trop long, qui ne commence pas par 6 ou masqué", () => {
    expect(neufChiffres("6 75 12")).toBeNull();
    expect(neufChiffres("6 75 12 34 09 11")).toBeNull();
    expect(neufChiffres("2 75 12 34 09")).toBeNull();
    expect(neufChiffres("6 75 •• •• 09 · MTN")).toBeNull();
  });
});

describe("operateurDe", () => {
  it("lit l'opérateur écrit après la puce", () => {
    expect(operateurDe("6 99 12 34 56 · Orange", "699123456")).toBe("orange");
    expect(operateurDe("6 75 •• •• 09 · MTN", null)).toBe("mtn");
  });

  it("sinon le devine sur le début du numéro", () => {
    expect(operateurDe("699123456", "699123456")).toBe("orange");
    expect(operateurDe("655123456", "655123456")).toBe("orange");
    expect(operateurDe("651123456", "651123456")).toBe("mtn");
    expect(operateurDe("675123456", "675123456")).toBe("mtn");
  });
});

describe("decouperRegles", () => {
  it("met les numéros en gras et garde le texte tel quel", () => {
    const morceaux = decouperRegles("1. Jamais de remise. 2. Jamais de code. 3. Photo à 50 000 F.");
    expect(morceaux.filter((m) => m.gras).map((m) => m.texte)).toEqual(["1.", "2.", "3."]);
    expect(morceaux.map((m) => m.texte).join("")).toBe(
      "1. Jamais de remise. 2. Jamais de code. 3. Photo à 50 000 F.",
    );
  });

  it("un texte sans numéro reste d'un seul morceau", () => {
    expect(decouperRegles("Pas de règle")).toEqual([{ texte: "Pas de règle", gras: false }]);
  });
});
