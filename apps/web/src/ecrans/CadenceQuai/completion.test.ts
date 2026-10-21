import { describe, expect, it } from "vitest";
import { heureSecondes, partDe, validerSaisie } from "./completion";

const valide = { nom: "Ngono Albertine", piece: "2210", telephone: "" };

describe("validerSaisie", () => {
  it("accepte un nom et 4 chiffres, sans téléphone", () => {
    expect(validerSaisie(valide)).toEqual({
      ok: true,
      donnees: { nom: "Ngono Albertine", pieceQuatreDerniers: "2210", telephone: null },
    });
  });

  it("refuse un nom vide ou fait d'espaces : sans nom, pas d'embarquement", () => {
    expect(validerSaisie({ ...valide, nom: "" })).toEqual({ ok: false, champ: "nom" });
    expect(validerSaisie({ ...valide, nom: "   " })).toEqual({ ok: false, champ: "nom" });
  });

  it("nettoie les espaces du nom", () => {
    const verdict = validerSaisie({ ...valide, nom: "  Ngono   Albertine " });
    expect(verdict).toMatchObject({ ok: true, donnees: { nom: "Ngono Albertine" } });
  });

  it("exige exactement 4 chiffres pour la pièce", () => {
    for (const piece of ["", "221", "22100", "22a0", "2 210"]) {
      expect(validerSaisie({ ...valide, piece })).toEqual({ ok: false, champ: "piece" });
    }
  });

  it("met le téléphone au format international, avec ou sans espaces ni +237", () => {
    for (const telephone of ["655121234", "6 55 12 12 34", "+237 655 12 12 34", "237655121234"]) {
      expect(validerSaisie({ ...valide, telephone })).toMatchObject({
        ok: true,
        donnees: { telephone: "+237655121234" },
      });
    }
  });

  it("refuse un téléphone coupé (celui de la planche « 6 55 12 … » n'envoie aucun SMS)", () => {
    for (const telephone of ["6 55 12 …", "65512", "6551212345"]) {
      expect(validerSaisie({ ...valide, telephone })).toEqual({ ok: false, champ: "telephone" });
    }
  });

  it("signale d'abord le nom, puis la pièce, puis le téléphone", () => {
    expect(validerSaisie({ nom: "", piece: "", telephone: "1" })).toMatchObject({ champ: "nom" });
    expect(validerSaisie({ nom: "A", piece: "", telephone: "1" })).toMatchObject({
      champ: "piece",
    });
    expect(validerSaisie({ nom: "A", piece: "1234", telephone: "1" })).toMatchObject({
      champ: "telephone",
    });
  });
});

describe("partDe", () => {
  it("arrondit la part de la jauge : 15 et 6 sur 40 -> 38 % et 15 %", () => {
    expect(partDe(15, 40)).toBe(38);
    expect(partDe(6, 40)).toBe(15);
  });

  it("reste entre 0 et 100, même sans capacité", () => {
    expect(partDe(50, 40)).toBe(100);
    expect(partDe(-3, 40)).toBe(0);
    expect(partDe(5, 0)).toBe(0);
  });
});

describe("heureSecondes", () => {
  it("lit l'heure du contrat telle quelle (déjà à l'heure de Douala)", () => {
    expect(heureSecondes("2027-01-05T05:22:10.000+01:00")).toBe("05:22:10");
  });
});
