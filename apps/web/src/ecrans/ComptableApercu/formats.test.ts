import { describe, expect, it } from "vitest";
import {
  ageFichier,
  colonneNumerique,
  dateCourte,
  instantCourt,
  milliers,
  nomDeFichier,
  nomDuMois,
  nomsDesOnglets,
  tailleFichier,
  texteCellule,
  tonDuMode,
} from "./formats";

describe("milliers", () => {
  it("groupe par trois chiffres avec une espace, comme la planche", () => {
    expect(milliers(31_404)).toBe("31 404");
    expect(milliers(28_414_000)).toBe("28 414 000");
    expect(milliers(5000)).toBe("5 000");
    expect(milliers(950)).toBe("950");
    expect(milliers(0)).toBe("0");
  });

  it("écrit un montant négatif avec le vrai signe moins", () => {
    expect(milliers(-1000)).toBe("− 1 000");
  });
});

describe("tailleFichier", () => {
  it("écrit les mégaoctets avec une décimale et la virgule : 1 200 000 -> 1,2 Mo", () => {
    expect(tailleFichier(1_200_000)).toBe("1,2 Mo");
    expect(tailleFichier(12_000_000)).toBe("12 Mo");
    expect(tailleFichier(1_000_000)).toBe("1 Mo");
  });

  it("passe aux kilo-octets sous 1 Mo et aux octets sous 1 ko", () => {
    expect(tailleFichier(48_400)).toBe("48 ko");
    expect(tailleFichier(999_000)).toBe("999 ko");
    expect(tailleFichier(512)).toBe("512 o");
  });

  it("passe aux gigaoctets à partir de 1 Go", () => {
    expect(tailleFichier(2_500_000_000)).toBe("2,5 Go");
  });
});

describe("ageFichier", () => {
  const genere = "2027-01-05T07:38:00.000+01:00";
  const apres = (minutes: number) => new Date(new Date(genere).getTime() + minutes * 60_000);

  it("dans la minute, ou si l'horloge de l'appareil retarde : à l'instant", () => {
    expect(ageFichier(genere, apres(0))).toEqual({ genre: "instant" });
    expect(ageFichier(genere, apres(0.9))).toEqual({ genre: "instant" });
    expect(ageFichier(genere, apres(-3))).toEqual({ genre: "instant" });
  });

  it("puis en minutes, en heures, puis la date", () => {
    expect(ageFichier(genere, apres(1))).toEqual({ genre: "minutes", minutes: 1 });
    expect(ageFichier(genere, apres(59))).toEqual({ genre: "minutes", minutes: 59 });
    expect(ageFichier(genere, apres(60))).toEqual({ genre: "heures", heures: 1 });
    expect(ageFichier(genere, apres(23 * 60 + 59))).toEqual({ genre: "heures", heures: 23 });
    expect(ageFichier(genere, apres(24 * 60))).toEqual({ genre: "le", date: "5 janv. 07:38" });
  });

  it("un instant illisible est rendu tel quel", () => {
    expect(ageFichier("hier", apres(0))).toEqual({ genre: "le", date: "hier" });
  });
});

describe("instantCourt", () => {
  it("lit le jour et l'heure tels qu'ils sont écrits, à l'heure de Douala", () => {
    expect(instantCourt("2026-12-03T11:42:00.000+01:00")).toBe("3 déc. 11:42");
    expect(instantCourt("2027-01-05T07:38:00.000+01:00")).toBe("5 janv. 07:38");
  });
});

describe("cellules", () => {
  it("date ISO : jour et mois seulement, comme la planche (01/12)", () => {
    expect(dateCourte("2026-12-01")).toBe("01/12");
    expect(dateCourte("05:52")).toBe("05:52");
  });

  it("une cellule vide s'écrit « — », un montant se groupe, un texte reste tel quel", () => {
    expect(texteCellule(null)).toBe("—");
    expect(texteCellule(7500)).toBe("7 500");
    expect(texteCellule("2026-12-01")).toBe("01/12");
    expect(texteCellule("DLA-YDE")).toBe("DLA-YDE");
    expect(texteCellule("3 kg")).toBe("3 kg");
  });

  it("une colonne n'est à droite que si tous ses montants sont des nombres", () => {
    const lignes = [
      ["a", 5000, null],
      ["b", 3500, "x"],
    ];
    expect(colonneNumerique(lignes, 0)).toBe(false);
    expect(colonneNumerique(lignes, 1)).toBe(true);
    expect(colonneNumerique(lignes, 2)).toBe(false);
    expect(colonneNumerique([], 0)).toBe(false);
    expect(colonneNumerique([[null]], 0)).toBe(false);
  });

  it("le mode de paiement a sa couleur : CASH vert, MOMO ambre, ANNULÉ rouge, APP et USSD bleu", () => {
    expect(tonDuMode("CASH")).toBe("vert");
    expect(tonDuMode("MOMO")).toBe("ambre");
    expect(tonDuMode("ANNULÉ")).toBe("rouge");
    expect(tonDuMode("APP")).toBe("bleu");
    expect(tonDuMode("USSD")).toBe("bleu");
  });
});

describe("onglets et noms", () => {
  it("dit ce que le fichier contient, un onglet par vue, sans le compteur", () => {
    expect(
      nomsDesOnglets([
        { libelle: "Ventes · 31 404" },
        { libelle: "Par jour" },
        { libelle: "Par guichet" },
        { libelle: "Totaux" },
      ]),
    ).toBe("ventes · par jour · par guichet · totaux");
  });

  it("nom de fichier sans accent, sans espace, sans signe", () => {
    expect(nomDeFichier("Journal des ventes · décembre")).toBe("journal-des-ventes-decembre");
    expect(nomDeFichier("Écritures SYSCOHADA")).toBe("ecritures-syscohada");
  });

  it("le mois s'écrit en minuscules, sans l'année", () => {
    expect(nomDuMois("Décembre 2026")).toBe("décembre");
  });
});
