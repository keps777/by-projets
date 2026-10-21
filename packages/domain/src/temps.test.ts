import { describe, expect, it } from "vitest";
import { arrondirAuMultiple, diviser, fcfa, pourcentage, rendu } from "./money";
import {
  aammjjDouala,
  ajouterJours,
  ajouterMinutes,
  ecartMinutes,
  hhmmDouala,
  jourDouala,
  minuitSuivantDoualaMs,
  versIsoDouala,
} from "./temps";

describe("heures en Africa/Douala", () => {
  it("exprime tout en +01:00 en ISO", () => {
    expect(versIsoDouala("2027-01-05T04:30:00Z")).toBe("2027-01-05T05:30:00.000+01:00");
    expect(versIsoDouala(new Date("2027-07-01T23:59:59.123Z"))).toBe(
      "2027-07-02T00:59:59.123+01:00",
    );
  });

  it("concorde avec la base de fuseaux du moteur JavaScript, toute l'année (pas d'heure d'été)", () => {
    for (let jour = 0; jour < 366; jour += 5) {
      const instant = Date.UTC(2027, 0, 1 + jour, 11, 7, 3);
      const parties = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "Africa/Douala",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(instant)
          .map((p) => [p.type, p.value]),
      ) as Record<string, string>;
      const iso = versIsoDouala(instant);
      expect(jourDouala(instant)).toBe(`${parties["year"]}-${parties["month"]}-${parties["day"]}`);
      expect(iso.slice(11, 16)).toBe(`${parties["hour"]}:${parties["minute"]}`);
    }
  });

  it("AAMMJJ et HHMM", () => {
    expect(aammjjDouala("2027-01-05T05:14:52+01:00")).toBe("270105");
    expect(hhmmDouala("2027-01-05T05:14:52+01:00")).toBe("0514");
    expect(aammjjDouala("2027-12-31T23:30:00Z")).toBe("280101");
  });

  it("minuit suivant", () => {
    expect(versIsoDouala(minuitSuivantDoualaMs("2027-01-05T00:00:00+01:00"))).toBe(
      "2027-01-06T00:00:00.000+01:00",
    );
    expect(versIsoDouala(minuitSuivantDoualaMs("2027-01-05T23:59:59.999+01:00"))).toBe(
      "2027-01-06T00:00:00.000+01:00",
    );
  });

  it("additions et écarts", () => {
    expect(ajouterMinutes("2027-01-05T07:50:00+01:00", 20)).toBe("2027-01-05T08:10:00.000+01:00");
    expect(ajouterJours("2027-01-31T10:00:00+01:00", 1)).toBe("2027-02-01T10:00:00.000+01:00");
    expect(ecartMinutes("2027-01-05T08:00:00+01:00", "2027-01-05T07:00:00+01:00")).toBe(60);
  });

  it("refuse une date invalide", () => {
    expect(() => versIsoDouala("pas une date")).toThrow(RangeError);
  });
});

describe("montants en FCFA entiers", () => {
  it("n'accepte que des entiers", () => {
    expect(fcfa(4000)).toBe(4000);
    expect(() => fcfa(0.5)).toThrow(RangeError);
    expect(() => fcfa(Number.NaN)).toThrow(RangeError);
  });

  it("arrondit les pourcentages sans flottant", () => {
    expect(pourcentage(25_001, 2, "plafond")).toBe(501);
    expect(pourcentage(25_001, 2, "plancher")).toBe(500);
    expect(pourcentage(1005, 70, "plancher")).toBe(703);
    expect(pourcentage(1005, 70, "plafond")).toBe(704);
    expect(pourcentage(5500, 50)).toBe(2750);
  });

  it("divise et arrondit", () => {
    expect(diviser(7, 2, "proche")).toBe(4);
    expect(diviser(5, 2, "plancher")).toBe(2);
    expect(diviser(-5, 2, "plancher")).toBe(-3);
    expect(arrondirAuMultiple(1749, 100)).toBe(1700);
    expect(arrondirAuMultiple(1750, 100)).toBe(1800);
  });

  it("rend la monnaie (5 000 pour 4 000 → 1 000)", () => {
    expect(rendu(5000, 4000)).toBe(1000);
    expect(() => rendu(3000, 4000)).toThrow(RangeError);
  });
});
