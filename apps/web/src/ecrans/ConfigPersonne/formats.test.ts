import { describe, expect, it } from "vitest";
import {
  afficherTelephone,
  formaterJour,
  formaterMontant,
  lireMontant,
  lireTelephone,
  nomCourt,
} from "./formats";

describe("téléphone", () => {
  it("écrit un numéro de l'API comme la planche : « 6 77 12 34 23 »", () => {
    expect(afficherTelephone("+237677123423")).toBe("6 77 12 34 23");
  });

  it("laisse tel quel un numéro étranger ou incomplet", () => {
    expect(afficherTelephone("+15145550142")).toBe("+15145550142");
    expect(afficherTelephone("+23767712")).toBe("+23767712");
  });

  it("lit les écritures usuelles d'un numéro camerounais", () => {
    for (const saisie of [
      "6 77 12 34 23",
      "677123423",
      "677-12-34-23",
      "237 677 12 34 23",
      "+237 677 123 423",
    ]) {
      expect(lireTelephone(saisie), saisie).toBe("+237677123423");
    }
  });

  it("garde un numéro international, de 9 à 15 chiffres", () => {
    expect(lireTelephone("+1 514 555 0142")).toBe("+15145550142");
    expect(lireTelephone("+12345678")).toBeNull();
    expect(lireTelephone("+1234567890123456")).toBeNull();
  });

  it("refuse ce qui n'est pas un numéro : vide, trop court, trop long, lettres", () => {
    for (const saisie of ["", "  ", "6 77 12 34", "6771234230", "abc", "6 77 12 34 2x"]) {
      expect(lireTelephone(saisie), saisie).toBeNull();
    }
  });

  it("lire puis afficher redonne la même écriture", () => {
    expect(afficherTelephone(lireTelephone("677123423")!)).toBe("6 77 12 34 23");
  });
});

describe("montant", () => {
  it("met une espace entre les milliers", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(950)).toBe("950");
    expect(formaterMontant(95000)).toBe("95 000");
    expect(formaterMontant(1250000)).toBe("1 250 000");
  });

  it("lit « 95 000 » comme 95000 et une saisie sans chiffre comme vide, jamais 0", () => {
    expect(lireMontant("95 000")).toBe(95000);
    expect(lireMontant("95000 F")).toBe(95000);
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("abc")).toBeNull();
    expect(lireMontant("0")).toBe(0);
  });

  it("borne la saisie à 9 chiffres", () => {
    expect(lireMontant("1234567890123")).toBe(123456789);
  });
});

describe("nom court", () => {
  it("garde le prénom et l'initiale du dernier mot", () => {
    expect(nomCourt("Joseph Mbappé")).toBe("Joseph M.");
    expect(nomCourt("Jean Pierre ndongo")).toBe("Jean N.");
  });

  it("ne raccourcit pas deux fois un nom déjà court", () => {
    expect(nomCourt("Marie T.")).toBe("Marie T.");
    expect(nomCourt("B. Ngo")).toBe("B. Ngo");
    expect(nomCourt("Mme Essono")).toBe("Mme E.");
  });

  it("supporte un seul mot et un nom vide", () => {
    expect(nomCourt("Kevin")).toBe("Kevin");
    expect(nomCourt("  ")).toBe("");
  });
});

describe("jour", () => {
  it("écrit « 5 janv. 2027 » en français et reste sur le jour demandé (pas de décalage de fuseau)", () => {
    expect(formaterJour("2027-01-05", "fr")).toBe("5 janv. 2027");
    expect(formaterJour("2026-12-31", "fr")).toBe("31 déc. 2026");
  });
});
