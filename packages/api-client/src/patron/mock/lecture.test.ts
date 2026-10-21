import { describe, expect, it } from "vitest";
import {
  TexteIllisible,
  dateFrancaise,
  entier,
  instantFrancais,
  minutes,
  montant,
  nombreAvant,
  pourcent,
  quand,
  repartir,
  segments,
} from "./lecture";

describe("lecture des textes de planche", () => {
  it("entier : espaces des milliers, vrai signe moins", () => {
    expect(entier("1 204")).toBe(1204);
    expect(entier("− 1 000")).toBe(-1000);
    expect(entier("0 litige")).toBe(0);
    expect(entier("5 (20 000 F), toutes avec PIN ·")).toBe(5);
    expect(entier(612)).toBe(612);
    expect(() => entier("rien")).toThrow(TexteIllisible);
  });

  it("montant : M, k et entiers en FCFA", () => {
    expect(montant("2,61 M")).toBe(2_610_000);
    expect(montant("28,4 M")).toBe(28_400_000);
    expect(montant("+ 0,6 M")).toBe(600_000);
    expect(montant("− 310 k")).toBe(-310_000);
    expect(montant("+ 131 k")).toBe(131_000);
    expect(montant("jusqu'à 12 M")).toBe(12_000_000);
    expect(montant("1 412 000")).toBe(1_412_000);
    expect(Number.isInteger(montant("14,2 M"))).toBe(true);
    expect(() => montant("beaucoup")).toThrow(TexteIllisible);
  });

  it("pourcent : signe et décimales", () => {
    expect(pourcent("86 %")).toBe(86);
    expect(pourcent("+ 8 %")).toBe(8);
    expect(pourcent("− 14 %")).toBe(-14);
    expect(pourcent("0,7 % · normal")).toBe(0.7);
    expect(pourcent("99,8 % rapproché")).toBe(99.8);
    expect(pourcent("− 62 % depuis la panne")).toBe(-62);
  });

  it("nombreAvant, minutes, segments", () => {
    expect(nombreAvant("142 billets · 38 colis · 0 écart", "colis")).toBe(38);
    expect(nombreAvant("rien", "colis")).toBeNull();
    expect(minutes("2 h 10")).toBe(130);
    expect(minutes("40 min")).toBe(40);
    expect(minutes("à l'heure")).toBeNull();
    expect(segments("Akwa · Mme Essono ·  ")).toEqual(["Akwa", "Mme Essono"]);
  });

  it("dates françaises → jours et instants à Douala", () => {
    expect(dateFrancaise("15 déc. 14:00")).toEqual({ jour: "2026-12-15", heure: "14:00" });
    expect(dateFrancaise("depuis le 5 janv. 2027")).toEqual({ jour: "2027-01-05", heure: null });
    expect(dateFrancaise("Signée le 12 oct. 2026")).toEqual({ jour: "2026-10-12", heure: null });
    expect(instantFrancais("12 oct. 09:40")).toBe("2026-10-12T09:40:00.000+01:00");
    expect(() => dateFrancaise("jamais")).toThrow(TexteIllisible);
  });

  it("quand : une heure du jour, ou « hier »", () => {
    expect(quand("14:00")).toBe("2027-01-05T14:00:00.000+01:00");
    expect(quand("hier")).toBe("2027-01-04T18:00:00.000+01:00");
    expect(() => quand("avant-hier")).toThrow(TexteIllisible);
  });

  it("repartir : la somme est exactement le total, au prorata des poids", () => {
    const parts = repartir(28_400_000, [62, 58, 55, 60, 88, 100, 70]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(28_400_000);
    expect(parts.every(Number.isInteger)).toBe(true);
    expect(parts[5]).toBeGreaterThan(parts[4]!);
    expect(repartir(10, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(10);
    expect(repartir(5, [0, 0])).toEqual([0, 0]);
  });
});
