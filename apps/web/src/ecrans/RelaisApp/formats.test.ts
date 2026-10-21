import { describe, expect, it } from "vitest";
import {
  chiffresDuCode,
  formaterMontant,
  formaterNote,
  formaterPoids,
  heureDouala,
  numeroCourt,
} from "./formats";

describe("RelaisApp · formats", () => {
  it("écrit les montants avec une espace ordinaire entre les milliers", () => {
    expect(formaterMontant(200)).toBe("200");
    expect(formaterMontant(8400)).toBe("8 400");
    expect(formaterMontant(1250000)).toBe("1 250 000");
  });

  it("donne toujours une décimale à la note, avec une virgule", () => {
    expect(formaterNote(4.9)).toBe("4,9");
    expect(formaterNote(5)).toBe("5,0");
  });

  it("lit l'heure de Douala dans la date du contrat, sans conversion", () => {
    expect(heureDouala("2027-01-05T13:30:00.000+01:00")).toBe("13:30");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("abrège le numéro du colis comme la planche", () => {
    expect(numeroCourt("C-DLA-270105-0017")).toBe("C-…-0017");
    expect(numeroCourt("0017")).toBe("0017");
    expect(numeroCourt("C-0017")).toBe("C-0017");
  });

  it("écrit le poids avec une virgule décimale", () => {
    expect(formaterPoids(4)).toBe("4 kg");
    expect(formaterPoids(1.5)).toBe("1,5 kg");
  });

  it("ne garde que six chiffres du code saisi ou collé", () => {
    expect(chiffresDuCode("48 29-13")).toBe("482913");
    expect(chiffresDuCode("12345678")).toBe("123456");
    expect(chiffresDuCode("abc")).toBe("");
  });
});
