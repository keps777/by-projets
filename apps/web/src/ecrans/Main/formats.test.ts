import { describe, expect, it } from "vitest";
import {
  ajouterJours,
  heureDouala,
  jourCourt,
  jourLong,
  villeDepuisApi,
  villeDepuisNom,
} from "./formats";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    typeof valeur === "object" && valeur !== null
      ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`],
  );
}

function valeurs(objet: Record<string, unknown>): string[] {
  return Object.values(objet).flatMap((valeur) =>
    typeof valeur === "object" && valeur !== null
      ? valeurs(valeur as Record<string, unknown>)
      : [String(valeur)],
  );
}

describe("Main · formats", () => {
  it("lit l'heure de Douala dans une date ISO de l'API", () => {
    expect(heureDouala("2027-01-05T07:38:00.000+01:00")).toBe("07:38");
    expect(heureDouala("pas une date")).toBe("");
  });

  it("donne le code des villes connues et une abréviation sans accent pour les autres", () => {
    expect(villeDepuisNom("Douala")).toEqual({ code: "DLA", nom: "Douala" });
    expect(villeDepuisNom("Ngaoundéré")).toEqual({ code: "NGA", nom: "Ngaoundéré" });
    expect(villeDepuisNom("Édéa")).toEqual({ code: "EDE", nom: "Édéa" });
    expect(villeDepuisApi({ code: "BAF", nom: "Bafoussam" })).toEqual({
      code: "BAF",
      nom: "Bafoussam",
    });
    expect(villeDepuisApi({ nom: "Limbé" })).toEqual({ code: "LIM", nom: "Limbé" });
  });

  it("ajoute des jours en changeant de mois et d'année sans dépendre du fuseau", () => {
    expect(ajouterJours("2027-01-05", 0)).toBe("2027-01-05");
    expect(ajouterJours("2027-01-05", 1)).toBe("2027-01-06");
    expect(ajouterJours("2027-01-31", 1)).toBe("2027-02-01");
    expect(ajouterJours("2027-12-31", 2)).toBe("2028-01-02");
  });

  it("écrit un jour en français : court pour la puce, long pour la feuille", () => {
    expect(jourCourt("2027-01-07", "fr")).toBe("jeu. 7");
    expect(jourLong("2027-01-07", "fr")).toBe("jeudi 7 janvier");
    expect(jourLong("2027-01-07", "en")).toBe("Thursday 7 January");
  });
});

describe("Main · textes", () => {
  it("a exactement les mêmes clés en français, anglais et pidgin", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });

  it("a le français rempli, sans valeur vide", () => {
    expect(valeurs(fr).filter((valeur) => valeur.trim() === "")).toEqual([]);
  });
});
