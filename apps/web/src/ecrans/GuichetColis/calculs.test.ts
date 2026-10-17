import { describe, expect, it } from "vitest";
import {
  codeApproche,
  destinataireMasque,
  formaterContact,
  formaterMontant,
  formaterPoids,
  heureDouala,
  lireContact,
  lireMontant,
  lirePoids,
  portDuDevis,
  primeDe,
} from "./calculs";

describe("GuichetColis · calculs", () => {
  it("formate et relit les montants, les poids et les heures", () => {
    expect(formaterMontant(25000)).toBe("25 000");
    expect(formaterMontant(500)).toBe("500");
    expect(lireMontant("25 000")).toBe(25000);
    expect(lireMontant("25000 F")).toBe(25000);
    expect(lireMontant("vingt")).toBeNull();
    expect(lireMontant("")).toBeNull();
    expect(formaterPoids(2)).toBe("2 kg");
    expect(formaterPoids(2.5)).toBe("2,5 kg");
    expect(lirePoids("2 kg")).toBe(2);
    expect(lirePoids("2,5")).toBe(2.5);
    expect(lirePoids("0")).toBeNull();
    expect(lirePoids("beaucoup")).toBeNull();
    expect(heureDouala("2027-01-05T08:15:00.000+01:00")).toBe("08:15");
  });

  it("lit un contact « nom · téléphone » en numéro international", () => {
    expect(lireContact("Ngo Aïcha · 6 91 22 10 08")).toEqual({
      nom: "Ngo Aïcha",
      telephone: "+237691221008",
    });
    expect(lireContact("Ngo Aïcha · +237 691 221 008")).toEqual({
      nom: "Ngo Aïcha",
      telephone: "+237691221008",
    });
    expect(lireContact("Ngo Aïcha · 6 91 22")).toBeNull();
    expect(lireContact("6 91 22 10 08")).toBeNull();
    expect(lireContact(" · 6 91 22 10 08")).toBeNull();
    expect(formaterContact({ nom: "Ngo Aïcha", telephone: "+237691221008" })).toBe(
      "Ngo Aïcha · 6 91 22 10 08",
    );
  });

  it("masque le numéro du destinataire : quatre derniers chiffres seulement", () => {
    expect(destinataireMasque("Ngo Thérèse · 6 99 40 18 22")).toBe("Ngo Thérèse · ···· 18 22");
    expect(destinataireMasque("Ngo Thérèse · 6 99")).toBe("Ngo Thérèse · ····");
    expect(destinataireMasque("Ngo Thérèse · 6 99 40 18 22")).not.toContain("99 40");
  });

  it("calcule le port, la prime d'assurance et un code de repli", () => {
    const lignes = [
      { code: "port", montant: 1500 },
      { code: "assurance", montant: 500 },
    ];
    expect(portDuDevis(lignes)).toBe(1500);
    expect(primeDe(25000, lignes)).toBe(500);
    expect(primeDe(100000, lignes)).toBe(2000);
    expect(primeDe(null, lignes)).toBe(500);
    expect(primeDe(null, [{ code: "port", montant: 1500 }])).toBe(0);
    expect(codeApproche("Yaoundé")).toBe("YAO");
  });
});
