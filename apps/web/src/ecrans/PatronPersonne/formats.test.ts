import { describe, expect, it } from "vitest";
import {
  HAUTEUR_JOUR_SANS_ECART,
  annulationsNormales,
  barresEcarts,
  ecart,
  estAuTravail,
  estFeminin,
  formaterJour,
  heureDouala,
  nombre,
  prenom,
  quandJournal,
  separerConclusion,
  taux,
} from "./formats";

describe("nombres et écarts", () => {
  it("groupe les milliers avec une espace, sans signe", () => {
    expect(nombre(1204)).toBe("1 204");
    expect(nombre(95000)).toBe("95 000");
    expect(nombre(694500)).toBe("694 500");
    expect(nombre(312)).toBe("312");
    expect(nombre(-3500)).toBe("3 500");
  });

  it("écrit un écart avec le vrai signe moins et une espace", () => {
    expect(ecart(-1000)).toBe("− 1 000");
    expect(ecart(-3500)).toBe("− 3 500");
    expect(ecart(500)).toBe("+ 500");
    expect(ecart(0)).toBe("0");
  });

  it("écrit un taux avec la virgule", () => {
    expect(taux(0.7)).toBe("0,7 %");
    expect(taux(12)).toBe("12 %");
  });

  it("juge le taux d'annulation : normal jusqu'au seuil, à surveiller au-delà", () => {
    expect(annulationsNormales(0.7)).toBe(true);
    expect(annulationsNormales(3)).toBe(true);
    expect(annulationsNormales(3.1)).toBe(false);
  });
});

describe("dates et heures de Douala", () => {
  it("lit l'heure dans l'ISO sans passer par le fuseau de l'appareil", () => {
    expect(heureDouala("2027-01-05T05:30:00.000+01:00")).toBe("05:30");
    expect(heureDouala("pas une date")).toBe("");
  });

  it("écrit le jour du journal : « 15 déc. 14:00 »", () => {
    expect(quandJournal("2026-12-15T14:00:00.000+01:00", "fr")).toBe("15 déc. 14:00");
    expect(quandJournal("2026-12-08T14:10:00.000+01:00", "fr")).toBe("8 déc. 14:10");
  });

  it("écrit la date d'embauche : « 5 janv. 2027 »", () => {
    expect(formaterJour("2027-01-05", "fr")).toBe("5 janv. 2027");
  });
});

describe("noms", () => {
  it("garde le prénom", () => {
    expect(prenom("Joseph M.")).toBe("Joseph");
    expect(prenom("  Marie ")).toBe("Marie");
  });

  it("accorde « Superviseure » d'après la civilité", () => {
    expect(estFeminin("Mme Essono")).toBe(true);
    expect(estFeminin("Mlle Ngo")).toBe(true);
    expect(estFeminin("M. Tchinda")).toBe(false);
    expect(estFeminin("Tchinda")).toBe(false);
  });

  it("une personne est au travail quand elle est en service, à bord ou en route", () => {
    expect(estAuTravail("en_service")).toBe(true);
    expect(estAuTravail("a_bord")).toBe(true);
    expect(estAuTravail("en_route")).toBe(true);
    expect(estAuTravail("repos")).toBe(false);
    expect(estAuTravail("bloquee")).toBe(false);
  });
});

describe("analyse de l'assistant", () => {
  it("met la dernière phrase en conclusion", () => {
    expect(
      separerConclusion(
        "Toujours en négatif. Marie, même guichet : 0 écart. Ce n'est pas le tiroir, c'est la monnaie rendue.",
      ),
    ).toEqual({
      debut: "Toujours en négatif. Marie, même guichet : 0 écart.",
      conclusion: "Ce n'est pas le tiroir, c'est la monnaie rendue.",
    });
  });

  it("garde un texte d'une seule phrase entier, sans le perdre", () => {
    expect(separerConclusion("Rien à signaler.")).toEqual({
      debut: "",
      conclusion: "Rien à signaler.",
    });
    expect(separerConclusion("")).toEqual({ debut: "", conclusion: "" });
  });
});

describe("barres du graphique des écarts", () => {
  const jours = [
    { jour: "2026-12-06", ecart: 0 },
    { jour: "2026-12-08", ecart: -1000 },
    { jour: "2026-12-12", ecart: -1500 },
    { jour: "2026-12-15", ecart: 500 },
  ];

  it("fait de la plus grande valeur absolue la barre pleine, les autres proportionnelles", () => {
    const barres = barresEcarts(jours);
    expect(barres.map((b) => b.jour)).toEqual([6, 8, 12, 15]);
    expect(barres.map((b) => b.hauteur)).toEqual([HAUTEUR_JOUR_SANS_ECART, 67, 100, 33]);
  });

  it("met en ambre les jours avec un écart (dans les deux sens) et en gris les autres", () => {
    expect(barresEcarts(jours).map((b) => b.accent)).toEqual([false, true, true, true]);
  });

  it("sans aucun écart, tout est gris et rien ne divise par zéro", () => {
    const barres = barresEcarts([{ jour: "2026-12-06", ecart: 0 }]);
    expect(barres).toEqual([
      { jour: 6, ecart: 0, accent: false, hauteur: HAUTEUR_JOUR_SANS_ECART },
    ]);
    expect(barresEcarts([])).toEqual([]);
  });

  it("une petite valeur reste plus haute que la pastille grise", () => {
    const [petite, grande] = barresEcarts([
      { jour: "2026-12-06", ecart: -500 },
      { jour: "2026-12-07", ecart: -50000 },
    ]);
    expect(petite!.hauteur).toBeGreaterThan(HAUTEUR_JOUR_SANS_ECART);
    expect(grande!.hauteur).toBe(100);
  });
});
