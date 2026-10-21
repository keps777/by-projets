import { describe, expect, it } from "vitest";
import { milliers, montantCourt, partDuPlafond, pourcent } from "./formats";

describe("Financement · formats", () => {
  it("montantCourt : millions comme la planche, groupes de trois chiffres en dessous", () => {
    expect(montantCourt(12_000_000)).toBe("12 M");
    expect(montantCourt(6_000_000)).toBe("6 M");
    expect(montantCourt(1_100_000)).toBe("1,1 M");
    expect(montantCourt(1_250_000)).toBe("1,25 M");
    expect(montantCourt(1_000_000)).toBe("1 M");
    expect(montantCourt(800_000)).toBe("800 000");
    expect(montantCourt(7500)).toBe("7 500");
  });

  it("milliers : espace tous les trois chiffres, jamais de signe", () => {
    expect(milliers(100_000)).toBe("100 000");
    expect(milliers(3500)).toBe("3 500");
    expect(milliers(950)).toBe("950");
    expect(milliers(-4000)).toBe("4 000");
  });

  it("pourcent : virgule décimale à la française", () => {
    expect(pourcent(8)).toBe("8");
    expect(pourcent(7.5)).toBe("7,5");
  });

  it("partDuPlafond : 6 M sur 12 M donne la moitié de la piste, borné à 0-100", () => {
    expect(partDuPlafond(6_000_000, 12_000_000)).toBe(50);
    expect(partDuPlafond(4_000_000, 12_000_000)).toBe(33.33);
    expect(partDuPlafond(20_000_000, 12_000_000)).toBe(100);
    expect(partDuPlafond(-1, 12_000_000)).toBe(0);
    expect(partDuPlafond(5, 0)).toBe(0);
  });
});
