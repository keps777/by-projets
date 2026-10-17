import { describe, expect, it } from "vitest";
import {
  estFeminin,
  formaterMontant,
  jourEtHeure,
  moisAnnee,
  telephoneLisible,
  telephoneMasque,
} from "./formats";

describe("Moi · formats", () => {
  it("sépare les milliers par une espace", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(250)).toBe("250");
    expect(formaterMontant(1250)).toBe("1 250");
    expect(formaterMontant(1234567)).toBe("1 234 567");
  });

  it("écrit le numéro camerounais par groupes, tel quel hors Cameroun", () => {
    expect(telephoneLisible("+237691221008")).toBe("+237 6 91 22 10 08");
    expect(telephoneLisible("+15145550123")).toBe("+15145550123");
  });

  it("ne montre que le début du numéro d'un proche", () => {
    expect(telephoneMasque("+237699123456")).toBe("6 99 …");
    expect(telephoneMasque("+15145550123")).toBeUndefined();
    expect(telephoneMasque(undefined)).toBeUndefined();
  });

  it("met le mois et l'année, le jour et l'heure à la française", () => {
    expect(moisAnnee("2027-01-01T08:00:00.000+01:00", "fr")).toBe("janv. 2027");
    expect(jourEtHeure("2027-01-05T08:00:00.000+01:00", "fr")).toBe("mar. 5 janv. · 08:00");
    // Le jour est celui écrit dans l'ISO de Douala, même tard le soir.
    expect(jourEtHeure("2027-01-05T23:30:00.000+01:00", "fr")).toBe("mar. 5 janv. · 23:30");
  });

  it("reconnaît un terme de parenté féminin", () => {
    expect(estFeminin("Maman")).toBe(true);
    expect(estFeminin("Tante Claire")).toBe(true);
    expect(estFeminin("Kevin")).toBe(false);
  });
});
