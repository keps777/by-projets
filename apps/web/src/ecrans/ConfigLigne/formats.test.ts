import { describe, expect, it } from "vitest";
import {
  estHeureValide,
  formaterMontant,
  lireMontant,
  normaliserHeure,
  prochainLundi,
} from "./formats";

describe("formaterMontant", () => {
  it.each([
    [0, "0"],
    [500, "500"],
    [3500, "3 500"],
    [1_412_000, "1 412 000"],
  ])("%i s'écrit « %s »", (montant, attendu) => {
    expect(formaterMontant(montant)).toBe(attendu);
  });
});

describe("lireMontant", () => {
  it("lit les chiffres d'une saisie, espaces comprises", () => {
    expect(lireMontant("5 000")).toBe(5000);
    expect(lireMontant("1000 F")).toBe(1000);
  });

  it("une saisie sans chiffre est vide (null), pas 0 : un tarif vide se voit au lieu de publier 0 F", () => {
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("  ")).toBeNull();
    expect(lireMontant("abc")).toBeNull();
    expect(lireMontant("0")).toBe(0);
  });
});

describe("normaliserHeure", () => {
  it.each([
    ["09:15", "09:15"],
    ["9:15", "09:15"],
    ["9h15", "09:15"],
    ["09H15", "09:15"],
    ["0915", "09:15"],
    ["915", "09:15"],
    [" 17:00 ", "17:00"],
    ["00:00", "00:00"],
    ["23:59", "23:59"],
  ])("« %s » est lu « %s »", (saisie, attendu) => {
    expect(normaliserHeure(saisie)).toBe(attendu);
  });

  it.each(["", "24:00", "12:60", "25:70", "9", "abc", "12:5", "123456", "1:2:3"])(
    "« %s » n'est pas une heure",
    (saisie) => {
      expect(normaliserHeure(saisie)).toBeNull();
    },
  );

  it("estHeureValide ne laisse passer que HH:MM", () => {
    expect(estHeureValide("09:15")).toBe(true);
    expect(estHeureValide("9:15")).toBe(false);
    expect(estHeureValide("")).toBe(false);
  });
});

describe("prochainLundi", () => {
  it("le mardi 5 janvier 2027 (jour de la planche), « dès lundi » est le 11 janvier", () => {
    expect(prochainLundi("2027-01-05T07:38:00.000+01:00")).toBe("2027-01-11");
  });

  it("un lundi, c'est le lundi suivant : le jour même ne change pas", () => {
    expect(prochainLundi("2027-01-11T07:38:00.000+01:00")).toBe("2027-01-18");
  });

  it("le dimanche, c'est le lendemain ; le samedi, dans deux jours", () => {
    expect(prochainLundi("2027-01-10T20:00:00.000+01:00")).toBe("2027-01-11");
    expect(prochainLundi("2027-01-09T20:00:00.000+01:00")).toBe("2027-01-11");
  });

  it("passe le changement de mois et d'année", () => {
    expect(prochainLundi("2027-12-29T10:00:00.000+01:00")).toBe("2028-01-03");
    expect(prochainLundi("2027-02-26T10:00:00.000+01:00")).toBe("2027-03-01");
  });
});
