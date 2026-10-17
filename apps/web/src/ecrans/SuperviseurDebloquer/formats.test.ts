import { describe, expect, it } from "vitest";
import {
  cashCourt,
  codeGuichet,
  dureeHorsLigne,
  fragmentsConstat,
  heureDouala,
  jourDeDouala,
  jourRelatif,
} from "./formats";

describe("SuperviseurDebloquer · formats", () => {
  it("écrit la durée hors ligne comme la planche : 760 minutes -> « 12 h 40 »", () => {
    expect(dureeHorsLigne(760)).toBe("12 h 40");
    expect(dureeHorsLigne(725)).toBe("12 h 05");
    expect(dureeHorsLigne(1440)).toBe("24 h 00");
    expect(dureeHorsLigne(-3)).toBe("0 h 00");
  });

  it("garde l'heure de Douala de l'API", () => {
    expect(heureDouala("2027-01-05T01:20:00.000+01:00")).toBe("01:20");
    expect(heureDouala("pas une date")).toBe("");
  });

  it("raccourcit le cash : 104 000 -> « 104 k », moins de 1 000 tel quel", () => {
    expect(cashCourt(104_000)).toBe("104 k");
    expect(cashCourt(104_600)).toBe("105 k");
    expect(cashCourt(850)).toBe("850");
    expect(cashCourt(0)).toBe("0");
  });

  it("tire le guichet du code de l'appareil", () => {
    expect(codeGuichet("GU3-DLA")).toBe("GU3");
    expect(codeGuichet("GU12")).toBe("GU12");
  });

  it("met en gras ce qui explique le blocage, et rien d'autre", () => {
    expect(
      fragmentsConstat(
        "Routeur 4G de la gare éteint depuis 01:20 · les guichets 1 et 2 passent par leur SIM",
      ),
    ).toEqual([
      { texte: "Routeur 4G de la gare ", gras: false },
      { texte: "éteint depuis 01:20", gras: true },
      { texte: " · les guichets 1 et 2 passent par leur SIM", gras: false },
    ]);
    expect(fragmentsConstat("SIM data du téléphone GU3 : crédit épuisé")).toEqual([
      { texte: "SIM data du téléphone GU3 : ", gras: false },
      { texte: "crédit épuisé", gras: true },
    ]);
    expect(fragmentsConstat("Téléphone sain · batterie 64 % · application à jour")).toEqual([
      { texte: "Téléphone sain · batterie 64 % · application à jour", gras: false },
    ]);
  });

  it("donne le jour de Douala, même quand l'appareil est dans un autre fuseau", () => {
    // 23:30 UTC le 4 janvier = 00:30 le 5 à Douala (UTC+1).
    expect(jourDeDouala(new Date("2027-01-04T23:30:00Z"))).toBe("2027-01-05");
    expect(jourDeDouala(new Date("2027-01-05T22:59:00Z"))).toBe("2027-01-05");
    expect(jourDeDouala(new Date("2027-01-05T23:00:00Z"))).toBe("2027-01-06");
  });

  it("situe la dernière synchronisation : aujourd'hui, hier, ou une date", () => {
    const maintenant = new Date("2027-01-05T07:38:00+01:00");
    expect(jourRelatif("2027-01-05T01:20:00.000+01:00", maintenant)).toEqual({
      jour: "aujourdhui",
    });
    expect(jourRelatif("2027-01-04T23:50:00.000+01:00", maintenant)).toEqual({ jour: "hier" });
    expect(jourRelatif("2027-01-03T10:00:00.000+01:00", maintenant)).toEqual({
      jour: "date",
      date: "03/01",
    });
    // Le jour se compte à Douala : 00:30 à Douala est déjà « aujourd'hui ».
    expect(
      jourRelatif("2027-01-05T00:30:00.000+01:00", new Date("2027-01-05T00:45:00+01:00")),
    ).toEqual({ jour: "aujourdhui" });
  });
});
