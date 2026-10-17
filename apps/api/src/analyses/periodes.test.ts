import { describe, expect, it } from "vitest";
import {
  JOURS_PAR_PERIODE,
  PERIODES,
  dateCourte,
  fenetre,
  jourParJour,
  jourSemaine,
  semaineIso,
  semaines,
  tranches,
} from "./periodes";

describe("fenetre", () => {
  it("se termine hier et a le libellé de la planche : « Semaine du 29 déc. au 4 janv. »", () => {
    const f = fenetre("semaine", "2027-01-05");
    expect(f).toMatchObject({
      du: "2026-12-29",
      au: "2027-01-04",
      jours: 7,
      precedentDu: "2026-12-22",
      precedentAu: "2026-12-28",
      libelle: "Semaine du 29 déc. au 4 janv.",
    });
  });

  it("n'inclut jamais le jour entamé et compare à la période d'avant, de même longueur", () => {
    for (const periode of PERIODES) {
      const f = fenetre(periode, "2027-01-05");
      expect(f.au).toBe("2027-01-04");
      expect(jourParJour(f.du, f.au)).toHaveLength(JOURS_PAR_PERIODE[periode]);
      expect(jourParJour(f.precedentDu, f.precedentAu)).toHaveLength(JOURS_PAR_PERIODE[periode]);
      expect(f.precedentAu < f.du).toBe(true);
    }
  });

  it("franchit les années et le 29 février", () => {
    expect(fenetre("mois", "2028-03-01")).toMatchObject({ au: "2028-02-29", du: "2028-02-02" });
    expect(fenetre("annee", "2027-01-05").du).toBe("2026-01-06");
  });

  it("nomme les périodes", () => {
    expect(fenetre("mois", "2027-01-05").libelle).toBe("Mois du 8 déc. au 4 janv.");
    expect(fenetre("trimestre", "2027-01-05").libelle).toMatch(/^Trimestre du /);
    expect(fenetre("annee", "2027-01-05").libelle).toMatch(/^Année du /);
  });
});

describe("tranches", () => {
  it("la semaine : un point par jour, avec l'initiale du jour, dans l'ordre du calendrier", () => {
    const t = tranches(fenetre("semaine", "2027-01-05"));
    expect(t.map((x) => x.libelle)).toEqual(["M", "M", "J", "V", "S", "D", "L"]);
    expect(t[0]).toMatchObject({ du: "2026-12-29", au: "2026-12-29" });
  });

  it("le mois et le trimestre : une tranche par semaine « S52 », l'année : un bloc de 4 semaines par mois", () => {
    const mois = tranches(fenetre("mois", "2027-01-05"));
    expect(mois).toHaveLength(4);
    expect(mois.map((x) => x.libelle)).toEqual(["S51", "S52", "S53", "S1"]);
    expect(tranches(fenetre("trimestre", "2027-01-05"))).toHaveLength(13);
    const annee = tranches(fenetre("annee", "2027-01-05"));
    expect(annee).toHaveLength(13);
    expect(annee[annee.length - 1]!.libelle).toBe("janv.");
  });

  it("couvre la période exactement : pas de trou, pas de recouvrement", () => {
    for (const periode of PERIODES) {
      const f = fenetre(periode, "2027-01-05");
      const t = tranches(f);
      expect(t[0]!.du).toBe(f.du);
      expect(t[t.length - 1]!.au).toBe(f.au);
      for (let i = 1; i < t.length; i++) {
        expect(jourParJour(t[i - 1]!.au, t[i]!.du)).toHaveLength(2); // jours consécutifs
      }
    }
  });
});

describe("calendrier", () => {
  it("jourSemaine : 0 = dimanche", () => {
    expect(jourSemaine("2027-01-05")).toBe(2); // mardi
    expect(jourSemaine("2027-01-03")).toBe(0);
    expect(jourSemaine("2024-02-29")).toBe(4);
  });

  it("semaine ISO, y compris autour du nouvel an", () => {
    expect(semaineIso("2027-01-04")).toBe(1);
    expect(semaineIso("2026-12-28")).toBe(53);
    expect(semaineIso("2026-10-12")).toBe(42);
  });

  it("semaines(au, n) : n semaines de 7 jours, la plus récente en dernier", () => {
    const s = semaines("2027-01-04", 8);
    expect(s).toHaveLength(8);
    expect(s[7]).toMatchObject({ du: "2026-12-29", au: "2027-01-04" });
    expect(s[0]!.du).toBe("2026-11-10");
  });

  it("dateCourte", () => {
    expect(dateCourte("2027-01-04")).toBe("4 janv.");
    expect(dateCourte("2026-12-29")).toBe("29 déc.");
  });
});
