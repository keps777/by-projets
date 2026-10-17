import { describe, expect, it } from "vitest";
import { formaterMontant, formaterNote, heureDouala, jourDouala } from "./formats";

describe("CovoitConducteur · formats", () => {
  it("groupe les milliers par une espace", () => {
    expect(formaterMontant(12000)).toBe("12 000");
    expect(formaterMontant(250)).toBe("250");
    expect(formaterMontant(1234567)).toBe("1 234 567");
    expect(formaterMontant(0)).toBe("0");
  });

  it("écrit la note avec une virgule et une étoile", () => {
    expect(formaterNote(4.9)).toBe("4,9 ★");
    expect(formaterNote(5)).toBe("5,0 ★");
  });

  it("lit l'heure de Douala dans l'instant de l'API, sans la décaler", () => {
    expect(heureDouala("2027-01-09T08:30:00.000+01:00")).toBe("08:30");
    expect(heureDouala("2027-01-10T17:00:00+01:00")).toBe("17:00");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("donne le jour de la semaine de la date de Douala", () => {
    expect(jourDouala("2027-01-09T08:30:00.000+01:00")).toBe("sam");
    expect(jourDouala("2027-01-10T17:00:00+01:00")).toBe("dim");
    expect(jourDouala("2027-01-11T00:10:00+01:00")).toBe("lun");
    expect(jourDouala("pas une date")).toBeNull();
  });
});
