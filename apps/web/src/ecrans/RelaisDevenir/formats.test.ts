import { describe, expect, it } from "vitest";
import { formaterMontant } from "./formats";

describe("formaterMontant", () => {
  it("groupe les milliers avec une espace ordinaire, comme la planche", () => {
    expect(formaterMontant(8400)).toBe("8 400");
    expect(formaterMontant(1250000)).toBe("1 250 000");
  });

  it("laisse les petits montants tels quels", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(200)).toBe("200");
    expect(formaterMontant(999)).toBe("999");
  });

  it("ne garde que la partie entière", () => {
    expect(formaterMontant(8400.9)).toBe("8 400");
  });

  it("garde le signe d'un montant négatif", () => {
    expect(formaterMontant(-1500)).toBe("-1 500");
  });
});
