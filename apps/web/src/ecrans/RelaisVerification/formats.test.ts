import { describe, expect, it } from "vitest";
import { etatsJalons, jourDeVisite, segmentsEtapes, separerRecit } from "./formats";

describe("segmentsEtapes", () => {
  it("étape 2 / 3 en cours : vert, ambre, gris (la planche)", () => {
    expect(segmentsEtapes({ courante: 2, total: 3 }, "en_cours")).toEqual([
      "fait",
      "courant",
      "reste",
    ]);
  });

  it("demande active : l'étape courante est verte aussi", () => {
    expect(segmentsEtapes({ courante: 3, total: 3 }, "active")).toEqual(["fait", "fait", "fait"]);
  });

  it("demande refusée : l'étape courante est rouge", () => {
    expect(segmentsEtapes({ courante: 2, total: 3 }, "refusee")).toEqual([
      "fait",
      "refuse",
      "reste",
    ]);
  });

  it("sans étape, pas de barre", () => {
    expect(segmentsEtapes(null, "refusee")).toEqual([]);
  });
});

describe("etatsJalons", () => {
  const jalons = [
    { fait: true },
    { fait: true },
    { fait: false },
    { fait: false },
    { fait: false },
  ];

  it("le premier jalon à faire est en cours, les suivants à venir", () => {
    expect(etatsJalons(jalons, "en_cours")).toEqual([
      "fait",
      "fait",
      "en-cours",
      "a-venir",
      "a-venir",
    ]);
  });

  it("une demande refusée n'a pas de jalon en cours", () => {
    expect(etatsJalons(jalons, "refusee")).toEqual([
      "fait",
      "fait",
      "a-venir",
      "a-venir",
      "a-venir",
    ]);
  });

  it("tout fait : aucun jalon en cours", () => {
    expect(etatsJalons([{ fait: true }, { fait: true }], "en_cours")).toEqual(["fait", "fait"]);
  });
});

describe("jourDeVisite", () => {
  it("prend le jour au début du créneau", () => {
    expect(jourDeVisite("jeudi entre 9 h et 12 h")).toBe("jeudi");
    expect(jourDeVisite("Demain à 10 h")).toBe("demain");
    expect(jourDeVisite("aujourd’hui avant 17 h")).toBe("aujourd’hui");
  });

  it("ne devine pas un jour absent ou collé à un autre mot", () => {
    expect(jourDeVisite("le 12 novembre")).toBeNull();
    expect(jourDeVisite("jeudiprochain")).toBeNull();
    expect(jourDeVisite("")).toBeNull();
  });
});

describe("separerRecit", () => {
  it("met la dernière phrase à part", () => {
    expect(separerRecit("Paul passe. Il colle l'affiche. Dès le soir, tu es visible.")).toEqual({
      debut: "Paul passe. Il colle l'affiche. ",
      fin: "Dès le soir, tu es visible.",
    });
  });

  it("garde une phrase unique telle quelle", () => {
    expect(separerRecit("Un agent passe jeudi.")).toEqual({
      debut: "Un agent passe jeudi.",
      fin: "",
    });
  });
});
