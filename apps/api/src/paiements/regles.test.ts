import { describe, expect, it } from "vitest";
import {
  RepartitionImpossible,
  afficherTelephone,
  attenteRemboursementMs,
  fraisParBillet,
  lienSansSchema,
  luhnValide,
  masquerTelephone,
  operateurProbable,
  partDe,
  prenomPourSms,
  repartir,
  ressembleANumeroDeCarte,
  verdictJetonCarte,
} from "./regles";

const COMPTES = { compagnie: "compte-alpha", afrimove: "compte-afrimove" };

describe("repartir : le prix à la compagnie, les frais à AfriMove", () => {
  it("deux lignes séparées, chacune vers son compte", () => {
    const r = repartir(
      [
        { code: "billet", montant: 4000 },
        { code: "frais_voyageur", montant: 250 },
      ],
      COMPTES,
      4250,
    );
    expect(r).toEqual([
      { beneficiaire: "compagnie", compteId: "compte-alpha", montant: 4000 },
      { beneficiaire: "afrimove", compteId: "compte-afrimove", montant: 250 },
    ]);
  });

  it("AfriMove ne reçoit jamais autre chose que les frais, quel que soit le nombre de billets", () => {
    for (const places of [1, 2, 5, 10]) {
      const r = repartir(
        [
          { code: "billet", montant: 4000 * places },
          { code: "frais_voyageur", montant: 250 * places },
        ],
        COMPTES,
        4250 * places,
      );
      expect(partDe(r, "afrimove")).toBe(250 * places);
      expect(partDe(r, "compagnie")).toBe(4000 * places);
    }
  });

  it("frais offerts (code promotionnel) : toute la somme va à la compagnie, aucune ligne pour AfriMove", () => {
    const r = repartir(
      [
        { code: "billet", montant: 7500 },
        { code: "frais_voyageur", montant: 0 },
      ],
      COMPTES,
      7500,
    );
    expect(r).toEqual([{ beneficiaire: "compagnie", compteId: "compte-alpha", montant: 7500 }]);
  });

  it("toute ligne qui n'est pas des frais (bagage, supplément) va à la compagnie", () => {
    const r = repartir(
      [
        { code: "billet", montant: 4000 },
        { code: "bagage", montant: 500 },
        { code: "frais_voyageur", montant: 250 },
      ],
      COMPTES,
      4750,
    );
    expect(partDe(r, "compagnie")).toBe(4500);
    expect(partDe(r, "afrimove")).toBe(250);
  });

  it("refuse un total qui ne correspond pas aux lignes, un montant négatif ou non entier, un total nul", () => {
    const lignes = [
      { code: "billet", montant: 4000 },
      { code: "frais_voyageur", montant: 250 },
    ];
    expect(() => repartir(lignes, COMPTES, 4000)).toThrow(RepartitionImpossible);
    expect(() => repartir(lignes, COMPTES, 4251)).toThrow(RepartitionImpossible);
    expect(() => repartir([{ code: "billet", montant: -5 }], COMPTES, -5)).toThrow(
      RepartitionImpossible,
    );
    expect(() => repartir([{ code: "billet", montant: 10.5 }], COMPTES, 10.5)).toThrow(
      RepartitionImpossible,
    );
    expect(() => repartir([], COMPTES, 0)).toThrow(RepartitionImpossible);
  });
});

describe("frais à rendre par billet", () => {
  it("part des frais divisée par le nombre de billets, arrondie vers le bas", () => {
    const r = repartir(
      [
        { code: "billet", montant: 12_000 },
        { code: "frais_voyageur", montant: 750 },
      ],
      COMPTES,
      12_750,
    );
    expect(fraisParBillet(r, 3)).toBe(250);
    expect(fraisParBillet(r, 2)).toBe(375);
    expect(fraisParBillet(r, 0)).toBe(0);
  });
});

describe("numéro de carte : jamais chez nous", () => {
  it("Luhn", () => {
    expect(luhnValide("4111111111111111")).toBe(true);
    expect(luhnValide("5555555555554444")).toBe(true);
    expect(luhnValide("4111111111111112")).toBe(false);
    expect(luhnValide("")).toBe(false);
    expect(luhnValide("41a1")).toBe(false);
  });

  it("reconnaît un numéro de carte avec espaces ou tirets", () => {
    expect(ressembleANumeroDeCarte("4111 1111 1111 1111")).toBe(true);
    expect(ressembleANumeroDeCarte("5555-5555-5555-4444")).toBe(true);
    expect(ressembleANumeroDeCarte("378282246310005")).toBe(true);
    expect(ressembleANumeroDeCarte("4111111111111112")).toBe(false);
    expect(ressembleANumeroDeCarte("tok_1NxQ7a2eZvKYlo2C")).toBe(false);
  });

  it("verdict : un jeton du prestataire passe, un numéro de carte est refusé net, le reste est mal formé", () => {
    expect(verdictJetonCarte("tok_1NxQ7a2eZvKYlo2C")).toBe("ok");
    expect(verdictJetonCarte("pm-card.visa_9f8e7d6c")).toBe("ok");
    expect(verdictJetonCarte("4111111111111111")).toBe("numero_de_carte");
    expect(verdictJetonCarte("4111 1111 1111 1111")).toBe("numero_de_carte");
    expect(verdictJetonCarte("court")).toBe("format");
    expect(verdictJetonCarte("avec des espaces dedans")).toBe("format");
    expect(verdictJetonCarte("<script>alert(1)</script>")).toBe("format");
  });
});

describe("numéros de téléphone", () => {
  it("masque tout sauf les trois derniers chiffres", () => {
    expect(masquerTelephone("+237691221008")).toBe("+237 ••••• 008");
    expect(masquerTelephone("+14165551234")).toBe("+141 ••••• 234");
  });

  it("affiche un numéro camerounais comme sur la maquette", () => {
    expect(afficherTelephone("+237691221008")).toBe("6 91 22 10 08");
    expect(afficherTelephone("+14165551234")).toBe("+14165551234");
  });

  it("opérateur probable d'après l'indicatif", () => {
    expect(operateurProbable("+237677012345")).toBe("mtn");
    expect(operateurProbable("+237683012345")).toBe("mtn");
    expect(operateurProbable("+237650012345")).toBe("mtn");
    expect(operateurProbable("+237654012345")).toBe("mtn");
    expect(operateurProbable("+237655012345")).toBe("orange");
    expect(operateurProbable("+237691221008")).toBe("orange");
    expect(operateurProbable("+237222012345")).toBeNull();
    expect(operateurProbable("+14165551234")).toBeNull();
  });
});

describe("prénom dans le SMS d'un proche", () => {
  it("ne garde que des lettres, espaces, tirets et apostrophes", () => {
    expect(prenomPourSms("Aïcha")).toBe("Aïcha");
    expect(prenomPourSms("Marie-Claire  N'Dour")).toBe("Marie-Claire N'Dour");
    expect(prenomPourSms("evil.cc/x")).toBe("evilccx");
    expect(prenomPourSms("http://x.cc")).toBe("httpxcc");
    expect(prenomPourSms("1234 ./")).toBeNull();
    expect(prenomPourSms("")).toBeNull();
    expect(prenomPourSms(null)).toBeNull();
    expect(prenomPourSms("a".repeat(80))).toHaveLength(30);
  });

  it("le lien perd son https:// (le gabarit SMS refuse les adresses complètes)", () => {
    expect(lienSansSchema("https://afrimove.app/payer/abc")).toBe("afrimove.app/payer/abc");
    expect(lienSansSchema("afrimove.app/payer/abc")).toBe("afrimove.app/payer/abc");
  });
});

describe("attente avant un nouvel essai de remboursement", () => {
  it("double à chaque essai, plafonnée à 6 heures", () => {
    expect(attenteRemboursementMs(1, 30_000)).toBe(30_000);
    expect(attenteRemboursementMs(2, 30_000)).toBe(60_000);
    expect(attenteRemboursementMs(3, 30_000)).toBe(120_000);
    expect(attenteRemboursementMs(30, 30_000)).toBe(6 * 3_600_000);
  });
});
