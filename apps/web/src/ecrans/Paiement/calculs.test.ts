import { describe, expect, it } from "vitest";
import {
  adresseHttps,
  delaiDepasse,
  enPhrase,
  formaterDevise,
  formaterMontant,
  garantieDe,
  issuePaiement,
  moyenInitial,
  moyensProposes,
} from "./calculs";

const vue = (code: "mtn_momo" | "orange_money" | "carte" | "proche", choisi = false) => ({
  code,
  nom: code,
  choisi,
});

describe("formaterMontant", () => {
  it("groupe les milliers avec une espace, comme la planche", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(250)).toBe("250");
    expect(formaterMontant(4250)).toBe("4 250");
    expect(formaterMontant(1234567)).toBe("1 234 567");
  });
});

describe("formaterDevise", () => {
  it("écrit l'unité mineure avec deux décimales", () => {
    expect(formaterDevise(1290, "CAD")).toBe("12,90 CAD");
    expect(formaterDevise(5, "EUR")).toBe("0,05 EUR");
    expect(formaterDevise(123456, "USD")).toBe("1 234,56 USD");
  });
});

describe("moyensProposes", () => {
  const tous = [vue("mtn_momo", true), vue("orange_money"), vue("carte"), vue("proche")] as const;

  it("garde les trois moyens qu'on choisit et écarte « un proche », qui est un lien", () => {
    expect(moyensProposes(tous, {}).map((m) => m.code)).toEqual([
      "mtn_momo",
      "orange_money",
      "carte",
    ]);
  });

  it("ne garde que la carte pour une commande réglée dans une autre devise", () => {
    const conversion = { devise: "CAD", montantMineur: 1290, approximatif: true };
    expect(moyensProposes(tous, { conversion }).map((m) => m.code)).toEqual(["carte"]);
  });

  it("rend une liste vide quand l'API ne propose rien (mode dégradé)", () => {
    expect(moyensProposes([], {})).toEqual([]);
  });
});

describe("moyenInitial", () => {
  it("prend le moyen présélectionné par l'API, sinon le premier, sinon rien", () => {
    expect(moyenInitial(moyensProposes([vue("mtn_momo"), vue("orange_money", true)], {}))).toBe(
      "orange_money",
    );
    expect(moyenInitial(moyensProposes([vue("carte"), vue("mtn_momo")], {}))).toBe("carte");
    expect(moyenInitial([])).toBeUndefined();
  });
});

describe("garantieDe", () => {
  it("ne dit « conducteur » que pour un covoiturage", () => {
    expect(garantieDe("covoiturage")).toBe("covoiturage");
    for (const type of ["billet", "groupe", "proche"] as const) {
      expect(garantieDe(type)).toBe("compagnie");
    }
  });
});

describe("adresseHttps", () => {
  it("n'accepte que les adresses https", () => {
    expect(adresseHttps("https://banque.example/3ds")).toBe("https://banque.example/3ds");
    expect(adresseHttps("http://banque.example/3ds")).toBeUndefined();
    expect(adresseHttps("javascript:alert(1)")).toBeUndefined();
    expect(adresseHttps("pas une adresse")).toBeUndefined();
    expect(adresseHttps(undefined)).toBeUndefined();
  });
});

describe("enPhrase", () => {
  it("met une majuscule et un point à la consigne du serveur", () => {
    expect(enPhrase("tu confirmes sur ton téléphone")).toBe("Tu confirmes sur ton téléphone.");
    expect(enPhrase("Confirme le paiement.")).toBe("Confirme le paiement.");
    expect(enPhrase("  ")).toBe("");
  });
});

describe("delaiDepasse", () => {
  it("est vrai à l'instant limite et après, faux avant ou si la date est illisible", () => {
    const limite = "2027-01-05T07:53:00.000+01:00";
    expect(delaiDepasse(limite, new Date("2027-01-05T07:52:59+01:00"))).toBe(false);
    expect(delaiDepasse(limite, new Date("2027-01-05T07:53:00+01:00"))).toBe(true);
    expect(delaiDepasse("n'importe quoi", new Date())).toBe(false);
  });
});

describe("issuePaiement", () => {
  it("attend tant que personne ne dit autre chose", () => {
    expect(issuePaiement(["en_attente_confirmation", undefined], false)).toBe("attente");
  });

  it("un statut définitif l'emporte sur « en attente »", () => {
    expect(issuePaiement(["en_attente_confirmation", "reussi"], false)).toBe("reussi");
    expect(issuePaiement(["en_attente_confirmation", "echoue"], false)).toBe("echoue");
    expect(issuePaiement([undefined, "expire"], false)).toBe("expire");
  });

  it("la réussite l'emporte sur l'échéance de la commande (l'argent a bougé)", () => {
    expect(issuePaiement(["reussi"], true)).toBe("reussi");
  });

  it("l'échéance de la commande clôt l'attente quand le serveur se tait", () => {
    expect(issuePaiement(["en_attente_confirmation"], true)).toBe("expire");
  });
});
