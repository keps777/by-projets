import { describe, expect, it } from "vitest";
import {
  dansLesBornes,
  estOptionRegulier,
  formaterMontant,
  formaterNote,
  lirePrix,
  momentDepart,
  prixAutorise,
  saisirPrix,
} from "./formats";

describe("formaterMontant", () => {
  it("groupe les milliers par une espace", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(500)).toBe("500");
    expect(formaterMontant(4000)).toBe("4 000");
    expect(formaterMontant(1234567)).toBe("1 234 567");
  });
});

describe("formaterNote", () => {
  it("écrit une décimale avec une virgule", () => {
    expect(formaterNote(4.9)).toBe("4,9");
    expect(formaterNote(5)).toBe("5,0");
  });
});

describe("momentDepart", () => {
  it("écrit le jour et l'heure de Douala", () => {
    expect(momentDepart("2027-01-09T08:30:00.000+01:00", "fr")).toBe("sam. · 08:30");
    expect(momentDepart("2027-01-10T19:05:00+01:00", "fr")).toBe("dim. · 19:05");
  });

  it("lit le jour à Douala, pas celui du fuseau de la machine : 00:15 dimanche à Douala est encore samedi en UTC", () => {
    expect(momentDepart("2027-01-10T00:15:00.000+01:00", "fr")).toBe("dim. · 00:15");
  });

  it("suit la langue", () => {
    expect(momentDepart("2027-01-09T08:30:00.000+01:00", "en")).toBe("Sat · 08:30");
  });
});

describe("lirePrix et saisirPrix", () => {
  it("lit un entier strictement positif", () => {
    expect(lirePrix("4 000")).toBe(4000);
    expect(lirePrix("4000")).toBe(4000);
    expect(lirePrix("")).toBeNull();
    expect(lirePrix("abc")).toBeNull();
    expect(lirePrix("0")).toBeNull();
    expect(lirePrix("000")).toBeNull();
  });

  it("ne garde que les chiffres, groupés, sur sept chiffres au plus", () => {
    expect(saisirPrix("4a0b0c0")).toBe("4 000");
    expect(saisirPrix("")).toBe("");
    expect(saisirPrix("x")).toBe("");
    expect(saisirPrix("123456789")).toBe("1 234 567");
  });
});

describe("fourchette de prix", () => {
  const bornes = { min: 3500, max: 4500 };

  it("accepte les bornes et ce qui est entre elles", () => {
    expect(prixAutorise(3500, bornes)).toBe(true);
    expect(prixAutorise(4000, bornes)).toBe(true);
    expect(prixAutorise(4500, bornes)).toBe(true);
  });

  it("refuse ce qui est dehors, et l'absence de prix", () => {
    expect(prixAutorise(3499, bornes)).toBe(false);
    expect(prixAutorise(4501, bornes)).toBe(false);
    expect(prixAutorise(null, bornes)).toBe(false);
  });

  it("ramène un prix dans la fourchette", () => {
    expect(dansLesBornes(100, bornes)).toBe(3500);
    expect(dansLesBornes(4000, bornes)).toBe(4000);
    expect(dansLesBornes(99999, bornes)).toBe(4500);
  });
});

describe("estOptionRegulier", () => {
  it("reconnaît le code du serveur et celui du mock", () => {
    expect(estOptionRegulier("regulier")).toBe(true);
    expect(estOptionRegulier("trajet-regulier-chaque-sam")).toBe(true);
    expect(estOptionRegulier("clim")).toBe(false);
    expect(estOptionRegulier("femmes")).toBe(false);
  });
});
