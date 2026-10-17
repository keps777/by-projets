import { describe, expect, it } from "vitest";
import { jourAvecAnnee, jourEtHeure, milliers, netCompact } from "./formats";

describe("formats de la convention", () => {
  it("milliers : groupes de trois chiffres séparés par une espace, signe moins typographique", () => {
    expect(milliers(0)).toBe("0");
    expect(milliers(1400)).toBe("1 400");
    expect(milliers(50_000)).toBe("50 000");
    expect(milliers(-1500)).toBe("− 1 500");
  });

  it("jourAvecAnnee et jourEtHeure lisent le jour tel que l'API l'écrit (Douala), sans fuseau de l'appareil", () => {
    expect(jourAvecAnnee("2026-10-12T11:05:00.000+01:00")).toBe("12 oct. 2026");
    expect(jourAvecAnnee("2026-12-01T23:59:00.000+01:00")).toBe("1 déc. 2026");
    expect(jourEtHeure("2026-10-12T09:40:00.000+01:00")).toBe("12 oct. 09:40");
    expect(jourEtHeure("2026-08-03T11:05:00.000+01:00")).toBe("3 août 11:05");
    expect(jourAvecAnnee("pas une date")).toBe("pas une date");
    expect(jourEtHeure("pas une date")).toBe("pas une date");
  });

  it("netCompact : milliers de francs avec le signe, comme « + 131 k » de la planche", () => {
    expect(netCompact(131_000)).toBe("+ 131 k");
    expect(netCompact(131_500)).toBe("+ 131,5 k");
    expect(netCompact(1_200_000)).toBe("+ 1 200 k");
    expect(netCompact(-8000)).toBe("− 8 k");
    expect(netCompact(800)).toBe("+ 800");
    expect(netCompact(-800)).toBe("− 800");
    expect(netCompact(0)).toBe("0");
  });
});
