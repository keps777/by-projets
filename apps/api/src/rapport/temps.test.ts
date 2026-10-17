import { describe, expect, it } from "vitest";
import {
  aammjj,
  bornesDuJour,
  debutDeJour,
  decalerJour,
  estDansLeJour,
  heureDouala,
  jourDouala,
  joursEntre,
  libelleJour,
  minutesDeHeure,
  minutesDouala,
  versIsoDouala,
} from "./temps";

describe("jour de Douala (UTC+1)", () => {
  it("bascule à minuit heure de Douala, pas à minuit UTC", () => {
    expect(jourDouala("2027-01-05T22:59:59.999Z")).toBe("2027-01-05");
    expect(jourDouala("2027-01-05T23:00:00.000Z")).toBe("2027-01-06");
    expect(jourDouala("2027-01-05T00:00:00.000+01:00")).toBe("2027-01-05");
    expect(jourDouala("2027-01-04T23:59:59.999+01:00")).toBe("2027-01-04");
  });

  it("lit l'heure de Douala : 21:00 = 20:00 UTC", () => {
    expect(minutesDouala("2027-01-05T20:00:00.000Z")).toBe(1260);
    expect(heureDouala("2027-01-05T07:30:00.000Z")).toBe("08:30");
    expect(heureDouala("2027-01-05T23:05:00.000Z")).toBe("00:05");
    expect(minutesDeHeure("21:00")).toBe(1260);
    expect(() => minutesDeHeure("25:00")).toThrow();
  });

  it("écrit un instant ISO avec le décalage +01:00", () => {
    expect(versIsoDouala(new Date("2027-01-05T20:00:00.000Z"))).toBe(
      "2027-01-05T21:00:00.000+01:00",
    );
    expect(versIsoDouala("2027-12-31T23:30:00.000Z")).toBe("2028-01-01T00:30:00.000+01:00");
  });

  it("n'accepte que les jours qui existent", () => {
    expect(debutDeJour("2027-01-05")?.toISOString()).toBe("2027-01-04T23:00:00.000Z");
    expect(debutDeJour("2027-02-30")).toBeNull();
    expect(debutDeJour("2027-13-01")).toBeNull();
    expect(debutDeJour("5 janvier")).toBeNull();
    expect(debutDeJour("2027-1-5")).toBeNull();
    expect(debutDeJour("2028-02-29")).not.toBeNull(); // 2028 est bissextile
    expect(debutDeJour("2027-02-29")).toBeNull();
  });

  it("passe d'un jour à l'autre, d'un mois à l'autre, d'une année à l'autre", () => {
    expect(decalerJour("2027-01-05", -1)).toBe("2027-01-04");
    expect(decalerJour("2027-01-01", -1)).toBe("2026-12-31");
    expect(decalerJour("2027-02-28", 1)).toBe("2027-03-01");
    expect(decalerJour("2028-02-28", 1)).toBe("2028-02-29");
    expect(joursEntre("2027-01-05", "2027-01-06")).toBe(1);
    expect(joursEntre("2026-12-31", "2027-01-05")).toBe(5);
    expect(joursEntre("2027-01-05", "2027-01-05")).toBe(0);
  });

  it("donne le jour des numéros (AAMMJJ) et les bornes du jour", () => {
    expect(aammjj("2027-01-05")).toBe("270105");
    expect(aammjj("2031-12-09")).toBe("311209");
    expect(bornesDuJour("2027-01-05")).toEqual({
      debut: "2027-01-05T00:00:00.000+01:00",
      fin: "2027-01-06T00:00:00.000+01:00",
    });
    expect(estDansLeJour("2027-01-05T00:00:00.000+01:00", "2027-01-05")).toBe(true);
    expect(estDansLeJour("2027-01-06T00:00:00.000+01:00", "2027-01-05")).toBe(false);
  });

  it("écrit le jour en français", () => {
    expect(libelleJour("2027-01-05")).toBe("mardi 5 janvier");
    expect(libelleJour("2027-02-01")).toBe("lundi 1 février");
    expect(libelleJour("2027-08-15")).toBe("dimanche 15 août");
    expect(libelleJour("2027-12-31")).toBe("vendredi 31 décembre");
  });
});
