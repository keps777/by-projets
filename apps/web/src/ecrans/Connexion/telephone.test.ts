import { describe, expect, it } from "vitest";
import {
  chiffresNational,
  formaterDelai,
  formaterNational,
  numeroValide,
  versInternational,
} from "./telephone";

describe("Connexion · numéro de téléphone", () => {
  it("écrit le numéro comme la maquette : un chiffre, puis des paires", () => {
    expect(formaterNational("691221008")).toBe("6 91 22 10 08");
    expect(formaterNational("6")).toBe("6");
    expect(formaterNational("69")).toBe("6 9");
    expect(formaterNational("6912")).toBe("6 91 2");
    expect(formaterNational("")).toBe("");
  });

  it("ne garde que les chiffres, au plus 9", () => {
    expect(chiffresNational("6 91 22 10 08")).toBe("691221008");
    expect(chiffresNational("6a9-1.2")).toBe("6912");
    expect(chiffresNational("69122100899")).toBe("691221008");
  });

  it("retire l'indicatif quand on colle un numéro complet", () => {
    expect(chiffresNational("+237 6 91 22 10 08")).toBe("691221008");
    expect(chiffresNational("237691221008")).toBe("691221008");
    expect(chiffresNational("00237691221008")).toBe("691221008");
  });

  it("ne confond pas un début de numéro avec l'indicatif", () => {
    expect(chiffresNational("237")).toBe("237");
    expect(chiffresNational("2376")).toBe("2376");
  });

  it("accepte 9 chiffres commençant par 6, rien d'autre", () => {
    expect(numeroValide("691221008")).toBe(true);
    expect(numeroValide("69122100")).toBe(false);
    expect(numeroValide("291221008")).toBe(false);
    expect(numeroValide("6912210081")).toBe(false);
    expect(numeroValide("69122100a")).toBe(false);
  });

  it("donne le format du contrat d'API", () => {
    expect(versInternational("691221008")).toBe("+237691221008");
  });

  it("écrit un délai en minutes et secondes", () => {
    expect(formaterDelai(42)).toBe("0:42");
    expect(formaterDelai(60)).toBe("1:00");
    expect(formaterDelai(9)).toBe("0:09");
    expect(formaterDelai(0)).toBe("0:00");
    expect(formaterDelai(41.2)).toBe("0:42");
    expect(formaterDelai(-3)).toBe("0:00");
  });
});
