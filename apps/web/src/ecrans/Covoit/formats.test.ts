import { describe, expect, it } from "vitest";
import {
  formaterDuree,
  formaterMontant,
  formaterNote,
  heureDouala,
  heureDoualaDe,
  momentDe,
  rechercheDe,
  separerLieu,
  tonDuRang,
} from "./formats";

describe("Covoit · formats", () => {
  it("lit l'heure de Douala dans une date de l'API", () => {
    expect(heureDouala("2027-01-05T08:30:00.000+01:00")).toBe("08:30");
    expect(heureDouala("pas une date")).toBe("");
  });

  it("donne l'heure de Douala (UTC+1) d'un instant", () => {
    expect(heureDoualaDe(new Date("2027-01-05T06:38:00Z"))).toBe("07:38");
    // Passé minuit à Douala, c'est déjà le lendemain.
    expect(heureDoualaDe(new Date("2027-01-05T23:15:00Z"))).toBe("00:15");
  });

  it("groupe les milliers avec une espace", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(500)).toBe("500");
    expect(formaterMontant(4000)).toBe("4 000");
    expect(formaterMontant(1250000)).toBe("1 250 000");
  });

  it("écrit les durées comme la planche : 2 h 30, 2 h, 45 min", () => {
    expect(formaterDuree(150)).toBe("2 h 30");
    expect(formaterDuree(125)).toBe("2 h 05");
    expect(formaterDuree(120)).toBe("2 h");
    expect(formaterDuree(45)).toBe("45 min");
  });

  it("écrit la note avec une virgule et une étoile", () => {
    expect(formaterNote(4.9)).toBe("4,9 ★");
    expect(formaterNote(5)).toBe("5,0 ★");
  });

  it("dit si l'on est le matin, l'après-midi ou le soir", () => {
    expect(momentDe("00:10")).toBe("matin");
    expect(momentDe("07:38")).toBe("matin");
    expect(momentDe("11:59")).toBe("matin");
    expect(momentDe("12:00")).toBe("apresMidi");
    expect(momentDe("17:59")).toBe("apresMidi");
    expect(momentDe("18:00")).toBe("soir");
  });

  it("construit la recherche : pas de filtre, un filtre, le plafond de prix", () => {
    const trajet = { depart: "Douala", arrivee: "Kribi" };
    expect(rechercheDe(trajet, [])).toEqual({ depart: "Douala", arrivee: "Kribi" });
    expect(rechercheDe(trajet, ["clim", "femmes"])).toEqual({
      depart: "Douala",
      arrivee: "Kribi",
      filtres: ["clim", "femmes"],
    });
    expect(rechercheDe(trajet, ["prix_max"])).toEqual({
      depart: "Douala",
      arrivee: "Kribi",
      filtres: ["prix_max"],
      prixMax: 4000,
    });
  });

  it("colore les avatars par rang : vert, bleu, ambre, puis on recommence", () => {
    expect([0, 1, 2, 3, 4, 5].map(tonDuRang)).toEqual([
      "vert",
      "bleu",
      "ambre",
      "vert",
      "bleu",
      "ambre",
    ]);
  });

  it("sépare le quartier du repère à la première virgule", () => {
    expect(separerLieu("Bonapriso, pharmacie du Rond-point")).toEqual({
      quartier: "Bonapriso",
      repere: ", pharmacie du Rond-point",
    });
    expect(separerLieu("Akwa")).toEqual({ quartier: "Akwa", repere: "" });
    expect(separerLieu("")).toEqual({ quartier: "", repere: "" });
  });
});
