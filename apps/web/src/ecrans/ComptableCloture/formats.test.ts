import { describe, expect, it } from "vitest";
import {
  enMinuscules,
  formatFichier,
  heureDe,
  instantAvecAnnee,
  milliers,
  moisSuivant,
  nomDuMois,
  sansAbonnement,
  tailleLisible,
} from "./formats";

describe("formats de la clôture", () => {
  it("milliers : groupes de trois chiffres séparés par une espace, signe moins typographique", () => {
    expect(milliers(0)).toBe("0");
    expect(milliers(28_414_000)).toBe("28 414 000");
    expect(milliers(-1500)).toBe("− 1 500");
  });

  it("instantAvecAnnee lit le jour et l'heure tels que l'API les écrit (Douala), sans fuseau de l'appareil", () => {
    expect(instantAvecAnnee("2027-01-05T09:12:00.000+01:00")).toBe("5 janv. 2027 · 09:12");
    expect(instantAvecAnnee("2026-12-31T23:59:00.000+01:00")).toBe("31 déc. 2026 · 23:59");
    expect(instantAvecAnnee("pas une date")).toBe("pas une date");
  });

  it("heureDe garde l'heure et les minutes", () => {
    expect(heureDe("2027-01-05T09:13:00.000+01:00")).toBe("09:13");
  });

  it("nomDuMois retire l'année, enMinuscules passe en minuscules", () => {
    expect(nomDuMois("Décembre 2026")).toBe("Décembre");
    expect(enMinuscules("Décembre")).toBe("décembre");
    expect(enMinuscules("Août")).toBe("août");
  });

  it("moisSuivant : le mois qui accueille les écritures après la clôture, décembre -> janvier", () => {
    expect(moisSuivant("2026-12")).toBe("janvier");
    expect(moisSuivant("2026-01")).toBe("février");
    expect(moisSuivant("2026-07")).toBe("août");
    expect(moisSuivant("n'importe quoi")).toBe("");
  });

  it("tailleLisible : Mo avec une décimale en virgule française, ko entiers, octets sinon", () => {
    expect(tailleLisible(1_200_000)).toBe("1,2 Mo");
    expect(tailleLisible(2_000_000)).toBe("2 Mo");
    expect(tailleLisible(84_000)).toBe("84 ko");
    expect(tailleLisible(31_499)).toBe("31 ko");
    expect(tailleLisible(812)).toBe("812 o");
  });

  it("formatFichier : le format puis le poids, ou les pages pour un PDF", () => {
    expect(formatFichier({ format: "xlsx", tailleOctets: 1_200_000, pages: null })).toBe(
      "xlsx · 1,2 Mo",
    );
    expect(formatFichier({ format: "csv", tailleOctets: 31_000, pages: null })).toBe("csv · 31 ko");
    expect(formatFichier({ format: "pdf", tailleOctets: null, pages: 2 })).toBe("pdf · 2 p.");
    expect(formatFichier({ format: "pdf", tailleOctets: null, pages: null })).toBe("pdf");
  });

  it("sansAbonnement retire « abonnement + » : le modèle d'AfriMove est sans abonnement", () => {
    expect(sansAbonnement("abonnement + 6 802 × 75 + 1 940 colis × 150")).toBe(
      "6 802 × 75 + 1 940 colis × 150",
    );
    expect(sansAbonnement("6 802 × 75 + 1 940 colis × 150")).toBe("6 802 × 75 + 1 940 colis × 150");
    expect(sansAbonnement("pas d'abonnement + ici")).toBe("pas d'abonnement + ici");
  });
});
