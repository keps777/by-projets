import { describe, expect, it } from "vitest";
import {
  ajouterJours,
  debutDuMois,
  debutDuMoisSuivant,
  dimancheDeLaSemaine,
  estMoisValide,
  heureDouala,
  jourDouala,
  jourIso,
  joursDuMois,
  libelleCourtMois,
  libelleMois,
  moisDe,
  moisPrecedent,
  moisSuivant,
  nomDuMois,
  versIsoDouala,
} from "./temps";

describe("mois comptables à Douala", () => {
  it("un instant tout près de minuit appartient au mois de Douala, pas à celui d'UTC", () => {
    // 31 décembre 23:30 à Douala = 22:30 UTC ; 1er janvier 00:30 à Douala = 31 décembre 23:30 UTC.
    expect(moisDe(new Date("2026-12-31T22:30:00.000Z"))).toBe("2026-12");
    expect(moisDe(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01");
    expect(jourDouala(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01-01");
    expect(heureDouala(new Date("2026-12-31T23:30:00.000Z"))).toBe("00:30");
  });

  it("borne le mois : début inclus, début du mois suivant exclu", () => {
    expect(debutDuMois("2026-12")).toBe("2026-12-01T00:00:00.000+01:00");
    expect(debutDuMoisSuivant("2026-12")).toBe("2027-01-01T00:00:00.000+01:00");
    expect(debutDuMoisSuivant("2027-02")).toBe("2027-03-01T00:00:00.000+01:00");
  });

  it("passe d'un mois à l'autre à cheval sur l'année", () => {
    expect(moisSuivant("2026-12")).toBe("2027-01");
    expect(moisPrecedent("2027-01")).toBe("2026-12");
    expect(moisSuivant("2026-04")).toBe("2026-05");
    expect(moisPrecedent("2026-04")).toBe("2026-03");
  });

  it("liste les jours du mois, février bissextile compris", () => {
    expect(joursDuMois("2026-12")).toHaveLength(31);
    expect(joursDuMois("2027-02")).toHaveLength(28);
    expect(joursDuMois("2028-02")).toHaveLength(29);
    expect(joursDuMois("2026-12")[0]).toBe("2026-12-01");
    expect(joursDuMois("2026-12")[30]).toBe("2026-12-31");
  });

  it("reconnaît un mois bien formé et rien d'autre", () => {
    for (const bon of ["2026-12", "2027-01", "2020-09"]) expect(estMoisValide(bon)).toBe(true);
    for (const mauvais of [
      "2026-13",
      "2026-00",
      "2026-1",
      "26-12",
      "2026-12-01",
      "",
      null,
      202612,
    ]) {
      expect(estMoisValide(mauvais)).toBe(false);
    }
  });

  it("écrit les libellés comme les écrans", () => {
    expect(nomDuMois("2026-12")).toBe("décembre");
    expect(nomDuMois("2027-02")).toBe("février");
    expect(libelleMois("2026-12")).toBe("Décembre 2026");
    expect(libelleCourtMois("2026-12", 2026)).toBe("Décembre");
    expect(libelleCourtMois("2026-12", 2027)).toBe("Décembre 2026");
  });

  it("calcule les semaines du lundi au dimanche", () => {
    expect(jourIso("2026-12-06")).toBe(7); // dimanche
    expect(jourIso("2026-12-07")).toBe(1); // lundi
    expect(dimancheDeLaSemaine("2026-12-02")).toBe("2026-12-06");
    expect(dimancheDeLaSemaine("2026-12-06")).toBe("2026-12-06");
    expect(dimancheDeLaSemaine("2026-12-07")).toBe("2026-12-13");
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(ajouterJours("2026-12-01", -1)).toBe("2026-11-30");
  });

  it("écrit un instant ISO avec le décalage de Douala", () => {
    expect(versIsoDouala(new Date("2027-01-05T08:12:00.000Z"))).toBe(
      "2027-01-05T09:12:00.000+01:00",
    );
    expect(() => versIsoDouala("pas une date")).toThrow(RangeError);
  });
});
