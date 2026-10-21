import { describe, expect, it } from "vitest";
import { formaterMontant, lireMontant, normaliserNumero } from "./formats";

describe("formaterMontant", () => {
  it("met une espace entre les milliers, comme la planche", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(500)).toBe("500");
    expect(formaterMontant(1000)).toBe("1 000");
    expect(formaterMontant(1250000)).toBe("1 250 000");
  });
});

describe("lireMontant", () => {
  it("lit les chiffres d'une saisie, ignore le reste", () => {
    expect(lireMontant("1 000")).toBe(1000);
    expect(lireMontant("2500 F")).toBe(2500);
    expect(lireMontant("0")).toBe(0);
  });

  it("une saisie sans chiffre est vide, jamais 0", () => {
    expect(lireMontant("")).toBeNull();
    expect(lireMontant(" F")).toBeNull();
  });
});

describe("normaliserNumero", () => {
  it("neuf chiffres : numéro camerounais, +237 ajouté ; espaces et tirets ignorés", () => {
    expect(normaliserNumero("677123456")).toBe("+237677123456");
    expect(normaliserNumero("6 77 12 34 56")).toBe("+237677123456");
    expect(normaliserNumero("6-77-12-34-56")).toBe("+237677123456");
  });

  it("un numéro international est gardé tel quel", () => {
    expect(normaliserNumero("+237 677 12 34 56")).toBe("+237677123456");
    expect(normaliserNumero("237677123456")).toBe("237677123456");
  });

  it("refuse ce qui n'est pas un numéro : trop court, trop long, lettres, numéro masqué", () => {
    expect(normaliserNumero("")).toBeNull();
    expect(normaliserNumero("12")).toBeNull();
    expect(normaliserNumero("12345678")).toBeNull();
    expect(normaliserNumero("1234567890123456")).toBeNull();
    expect(normaliserNumero("677 abc 456")).toBeNull();
    expect(normaliserNumero("6 77 •• •• 02")).toBeNull();
  });
});
