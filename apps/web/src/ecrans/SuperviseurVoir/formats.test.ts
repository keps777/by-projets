import { describe, expect, it } from "vitest";
import { minutesDepuis, sequenceBillet, suffixeOrdinal } from "./formats";

describe("minutesDepuis", () => {
  const demande = "2027-01-05T13:51:00.000+01:00";

  it("compte les minutes entières écoulées", () => {
    expect(minutesDepuis(demande, new Date("2027-01-05T14:02:00+01:00"))).toBe(11);
    expect(minutesDepuis(demande, new Date("2027-01-05T14:02:59+01:00"))).toBe(11);
    expect(minutesDepuis(demande, new Date("2027-01-05T13:51:00+01:00"))).toBe(0);
  });

  it("ne descend jamais sous zéro quand l'horloge est en retard sur la demande", () => {
    expect(minutesDepuis(demande, new Date("2027-01-05T07:38:00+01:00"))).toBe(0);
  });

  it("donne 0 pour une date illisible", () => {
    expect(minutesDepuis("n'importe quoi", new Date("2027-01-05T14:02:00+01:00"))).toBe(0);
  });
});

describe("sequenceBillet", () => {
  it("complète à quatre chiffres", () => {
    expect(sequenceBillet(171)).toBe("0171");
    expect(sequenceBillet(7)).toBe("0007");
    expect(sequenceBillet(12345)).toBe("12345");
  });
});

describe("suffixeOrdinal", () => {
  it("écrit « 1re » puis « 2e », « 3e »…", () => {
    expect(suffixeOrdinal(1)).toBe("re");
    expect(suffixeOrdinal(2)).toBe("e");
    expect(suffixeOrdinal(11)).toBe("e");
  });
});
