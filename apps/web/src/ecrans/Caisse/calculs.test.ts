import { comptageVide } from "@afrimove/ui";
import { describe, expect, it } from "vitest";
import fr from "./i18n.fr.json";
import en from "./i18n.en.json";
import pcm from "./i18n.pcm.json";
import {
  depuisSession,
  evaluerEcart,
  formaterMontant,
  heureDouala,
  minuitPasse,
  minuitSuivant,
  versDonneesComptage,
} from "./calculs";

function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    typeof valeur === "object" && valeur !== null
      ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`],
  );
}

describe("évaluer l'écart", () => {
  it("est exact à zéro, dans la tolérance jusqu'à la tolérance incluse, hors tolérance au-delà", () => {
    expect(evaluerEcart(695_500, 695_500, 1000)).toEqual({ montant: 0, statut: "exact" });
    expect(evaluerEcart(695_500, 694_500, 1000)).toEqual({
      montant: -1000,
      statut: "dans_tolerance",
    });
    expect(evaluerEcart(695_500, 696_500, 1000).statut).toBe("dans_tolerance");
    expect(evaluerEcart(695_500, 694_499, 1000).statut).toBe("hors_tolerance");
    expect(evaluerEcart(695_500, 696_501, 1000)).toEqual({
      montant: 1001,
      statut: "hors_tolerance",
    });
  });
});

describe("formats", () => {
  it("écrit les montants comme la planche", () => {
    expect(formaterMontant(694_500)).toBe("694 500");
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(-1000)).toBe("− 1 000");
    expect(formaterMontant(4000, true)).toBe("+ 4 000");
    expect(formaterMontant(0, true)).toBe("0");
    expect(formaterMontant(-8000)).toBe("− 8 000");
  });

  it("lit l'heure de Douala dans l'ISO du contrat", () => {
    expect(heureDouala("2027-01-05T05:02:00.000+01:00")).toBe("05:02");
  });
});

describe("minuit", () => {
  it("tombe à 00:00 à Douala le lendemain de l'ouverture", () => {
    expect(new Date(minuitSuivant("2027-01-05T05:02:00.000+01:00")).toISOString()).toBe(
      "2027-01-05T23:00:00.000Z",
    );
    expect(new Date(minuitSuivant("2027-12-31T05:02:00.000+01:00")).toISOString()).toBe(
      "2027-12-31T23:00:00.000Z",
    );
  });

  it("n'est atteint qu'à minuit pile", () => {
    const ouverte = "2027-01-05T05:02:00.000+01:00";
    expect(minuitPasse(ouverte, new Date("2027-01-05T23:59:59+01:00"))).toBe(false);
    expect(minuitPasse(ouverte, new Date("2027-01-06T00:00:00+01:00"))).toBe(true);
  });
});

describe("comptage", () => {
  const coupures = [10_000, 5_000, 2_000, 1_000, 500];

  it("part de la session et revient en données d'événement", () => {
    const comptage = depuisSession(
      [
        { valeur: 10_000, nombre: 48 },
        { valeur: 5_000, nombre: 36 },
        { valeur: 2_000, nombre: 14 },
        { valeur: 1_000, nombre: 5 },
        { valeur: 500, nombre: 3 },
      ],
      0,
    );
    const donnees = versDonneesComptage(comptage, coupures);
    expect(donnees.total).toBe(694_500);
    expect(donnees.pieces).toBe(0);
    expect(donnees.coupures).toHaveLength(5);
    expect(donnees.coupures[0]).toEqual({ valeur: 10_000, nombre: 48 });
  });

  it("envoie un total tapé comme montant des pièces, sans coupures", () => {
    const donnees = versDonneesComptage({ ...comptageVide(), totalManuel: 695_500 }, coupures);
    expect(donnees).toEqual({ coupures: [], pieces: 695_500, total: 695_500 });
  });

  it("garde les trois langues alignées", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});
