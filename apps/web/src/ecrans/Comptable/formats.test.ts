import { describe, expect, it } from "vitest";
import { jourDuMois, milliers, nomDuMois, partRapprochee } from "./formats";

describe("milliers", () => {
  it("groupe par trois chiffres avec une espace, comme la planche", () => {
    expect(milliers(7_648_000)).toBe("7 648 000");
    expect(milliers(16_000)).toBe("16 000");
    expect(milliers(1912)).toBe("1 912");
    expect(milliers(950)).toBe("950");
    expect(milliers(0)).toBe("0");
  });

  it("écrit un montant négatif avec le vrai signe moins", () => {
    expect(milliers(-1000)).toBe("− 1 000");
  });
});

describe("partRapprochee", () => {
  it("1 912 ventes dont 4 sans correspondance : 99,8 %", () => {
    expect(partRapprochee(1912, 4)).toBe("99,8 %");
  });

  it("arrondit à une décimale et n'écrit pas de zéro inutile", () => {
    expect(partRapprochee(200, 10)).toBe("95 %");
    expect(partRapprochee(8, 1)).toBe("87,5 %");
    expect(partRapprochee(3, 1)).toBe("66,7 %");
  });

  it("n'affiche jamais 100 % tant qu'une référence reste sans correspondance", () => {
    expect(partRapprochee(100_000, 1)).toBe("99,9 %");
  });

  it("100 % quand tout correspond, ou quand il n'y a aucune vente", () => {
    expect(partRapprochee(1912, 0)).toBe("100 %");
    expect(partRapprochee(0, 0)).toBe("100 %");
  });

  it("reste entre 0 et 100 % même si les compteurs sont incohérents", () => {
    expect(partRapprochee(10, 25)).toBe("0 %");
    expect(partRapprochee(10, -3)).toBe("100 %");
  });
});

describe("nomDuMois et jourDuMois", () => {
  it("met le mois en minuscules, comme dans les phrases de la planche", () => {
    expect(nomDuMois("Décembre")).toBe("décembre");
    expect(nomDuMois("Février")).toBe("février");
  });

  it("écrit 1er pour le premier du mois", () => {
    expect(jourDuMois(1)).toBe("1er");
    expect(jourDuMois(2)).toBe("2");
    expect(jourDuMois(31)).toBe("31");
  });
});
