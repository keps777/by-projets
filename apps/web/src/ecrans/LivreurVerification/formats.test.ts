import { describe, expect, it } from "vitest";
import { decouperEnDeuxLignes, decouperRecit, etatsDesJalons } from "./formats";

describe("etatsDesJalons", () => {
  it("coche ce qui est fait, met le premier jalon à faire en cours et le reste à venir", () => {
    const jalons = [true, true, false, false, false].map((fait) => ({ fait }));
    expect(etatsDesJalons(jalons)).toEqual(["fait", "fait", "en_cours", "a_venir", "a_venir"]);
  });

  it("n'a aucun jalon en cours quand tout est fait", () => {
    expect(etatsDesJalons([{ fait: true }, { fait: true }])).toEqual(["fait", "fait"]);
  });

  it("met le premier jalon en cours quand rien n'est fait", () => {
    expect(etatsDesJalons([{ fait: false }, { fait: false }])).toEqual(["en_cours", "a_venir"]);
  });

  it("ne marque en cours qu'un seul jalon même si un jalon fait suit un jalon à faire", () => {
    expect(
      etatsDesJalons([{ fait: true }, { fait: false }, { fait: true }, { fait: false }]),
    ).toEqual(["fait", "en_cours", "fait", "a_venir"]);
  });

  it("accepte une liste vide", () => {
    expect(etatsDesJalons([])).toEqual([]);
  });
});

describe("decouperRecit", () => {
  it("met la dernière phrase à part, comme le gras de la planche", () => {
    expect(
      decouperRecit("Tu as 30 s pour accepter. Tu roules. 700 F sur ton MoMo le soir même."),
    ).toEqual({
      debut: "Tu as 30 s pour accepter. Tu roules. ",
      fin: "700 F sur ton MoMo le soir même.",
    });
  });

  it("ne coupe pas un texte sans phrase suivante", () => {
    expect(decouperRecit("Une seule phrase.")).toEqual({ debut: "Une seule phrase.", fin: "" });
  });

  it("ne coupe pas une virgule décimale ni un point sans espace", () => {
    expect(decouperRecit("À 4,1 km, 700 F.")).toEqual({ debut: "À 4,1 km, 700 F.", fin: "" });
  });
});

describe("decouperEnDeuxLignes", () => {
  it("coupe après le premier mot", () => {
    expect(decouperEnDeuxLignes("Modifier ma fiche")).toEqual({
      haut: "Modifier",
      bas: "ma fiche",
    });
  });

  it("garde un mot seul sur une ligne", () => {
    expect(decouperEnDeuxLignes("Modifier")).toEqual({ haut: "Modifier", bas: "" });
  });
});
