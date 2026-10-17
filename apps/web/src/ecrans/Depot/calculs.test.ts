import { describe, expect, it } from "vitest";
import {
  calculerComplement,
  codeVille,
  controlerPoids,
  formaterKilos,
  formaterMontant,
  formaterTelephone,
  gareDuNumero,
  heureDouala,
  lirePoids,
  normaliserCode,
} from "./calculs";

describe("Depot · formats", () => {
  it("met le téléphone au format de la planche", () => {
    expect(formaterTelephone("+237691221008")).toBe("6 91 22 10 08");
    expect(formaterTelephone("691221008")).toBe("6 91 22 10 08");
    expect(formaterTelephone("inconnu")).toBe("inconnu");
  });

  it("groupe les milliers avec une espace simple", () => {
    expect(formaterMontant(2200)).toBe("2 200");
    expect(formaterMontant(25000)).toBe("25 000");
    expect(formaterMontant(950)).toBe("950");
  });

  it("écrit les kilos avec une virgule et sans zéro inutile", () => {
    expect(formaterKilos(2.1)).toBe("2,1");
    expect(formaterKilos(2)).toBe("2");
    expect(formaterKilos(3.25)).toBe("3,25");
  });

  it("lit l'heure de Douala dans l'horodatage de l'API", () => {
    expect(heureDouala("2027-01-05T07:40:00.000+01:00")).toBe("07:40");
  });

  it("lit le poids tapé", () => {
    expect(lirePoids("2,1")).toBe(2.1);
    expect(lirePoids(" 3.5 ")).toBe(3.5);
    expect(lirePoids("0")).toBeNull();
    expect(lirePoids("abc")).toBeNull();
    expect(lirePoids("")).toBeNull();
    expect(lirePoids("2,1,3")).toBeNull();
  });

  it("normalise le code tapé", () => {
    expect(normaliserCode("  c-alp-dla-270105-0017 ")).toBe("C-ALP-DLA-270105-0017");
  });
});

describe("Depot · contrôle du poids et complément", () => {
  it("est conforme jusqu'à 1 kg de plus que le déclaré, complément au-delà", () => {
    expect(controlerPoids(2.1, 2, 1)).toEqual({ ecartKg: 0.1, complementRequis: false });
    expect(controlerPoids(3, 2, 1).complementRequis).toBe(false);
    expect(controlerPoids(3.01, 2, 1).complementRequis).toBe(true);
    expect(controlerPoids(1.5, 2, 1)).toEqual({ ecartKg: -0.5, complementRequis: false });
  });

  it("chiffre le complément sur le port payé (total moins frais AfriMove et assurance)", () => {
    // 2 200 F payés = 1 500 F de port + 200 F de frais + 500 F d'assurance (2 % de 25 000) : 750 F le kilo déclaré.
    const base = {
      payeDansApp: 2200,
      assure: true,
      valeurDeclaree: 25000,
      poidsDeclareKg: 2,
    };
    expect(calculerComplement({ ...base, ecartKg: 1.5 })).toBe(1150);
    expect(calculerComplement({ ...base, ecartKg: 2 })).toBe(1500);
    expect(calculerComplement({ ...base, ecartKg: 0 })).toBe(0);
    expect(calculerComplement({ ...base, ecartKg: -1 })).toBe(0);
  });

  it("sans assurance, tout ce qui dépasse les 200 F de frais est du port", () => {
    expect(
      calculerComplement({
        payeDansApp: 1700,
        assure: false,
        valeurDeclaree: 25000,
        poidsDeclareKg: 2,
        ecartKg: 2,
      }),
    ).toBe(1500);
  });
});

describe("Depot · étiquette", () => {
  it("tire la gare du numéro et le code de la ville de destination", () => {
    expect(gareDuNumero("C-ALP-DLA-270105-0017")).toBe("DLA");
    expect(gareDuNumero("C-DLA-270105-0017")).toBe("DLA");
    expect(gareDuNumero("n'importe quoi")).toBe("");
    expect(codeVille("Bafoussam")).toBe("BAF");
    expect(codeVille("Yaoundé")).toBe("YAO");
  });
});
