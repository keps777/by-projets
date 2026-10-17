import { ecrans } from "@afrimove/fixtures";
import { describe, expect, it } from "vitest";
import {
  assuranceDe,
  detailDuPrix,
  formaterContact,
  formaterDestination,
  formaterMontant,
  formaterPoids,
  formaterTelephone,
  heureCourte,
  heureDouala,
  lireContact,
  lireMontant,
  saisirMontant,
  villeDe,
} from "./calculs";
import { DEMO_COLIS_ENVOI } from "./demo";

describe("ColisEnvoi · montants", () => {
  it("groupe les milliers avec une espace, comme la planche", () => {
    expect(formaterMontant(2200)).toBe("2 200");
    expect(formaterMontant(25000)).toBe("25 000");
    expect(formaterMontant(500000)).toBe("500 000");
    expect(formaterMontant(300)).toBe("300");
  });

  it("lit un montant écrit avec ou sans espaces, avec ou sans « F »", () => {
    expect(lireMontant("25 000")).toBe(25000);
    expect(lireMontant("25000")).toBe(25000);
    expect(lireMontant(" 25 000 F ")).toBe(25000);
    expect(lireMontant("0")).toBe(0);
  });

  it("refuse ce qui n'est pas un montant entier ou dépasse neuf chiffres", () => {
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("abc")).toBeNull();
    expect(lireMontant("12,5")).toBeNull();
    expect(lireMontant("-500")).toBeNull();
    expect(lireMontant("1 000 000 000")).toBeNull();
  });

  it("regroupe la saisie de la valeur au fil de la frappe et ne garde que les chiffres", () => {
    expect(saisirMontant("2")).toBe("2");
    expect(saisirMontant("2500")).toBe("2 500");
    expect(saisirMontant("25 0000")).toBe("250 000");
    expect(saisirMontant("12a3")).toBe("123");
    expect(saisirMontant("007")).toBe("7");
    expect(saisirMontant("")).toBe("");
    expect(saisirMontant("1234567890123")).toBe("123 456 789");
  });
});

describe("ColisEnvoi · heures et poids", () => {
  it("lit l'heure de Douala dans l'ISO du contrat", () => {
    expect(heureDouala("2027-01-05T08:15:00.000+01:00")).toBe("08:15");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("écrit l'heure d'arrivée comme la planche : « 13 h », « 13 h 30 »", () => {
    expect(heureCourte("2027-01-05T13:00:00.000+01:00")).toBe("13 h");
    expect(heureCourte("2027-01-05T09:05:00+01:00")).toBe("9 h 05");
    expect(heureCourte("2027-01-05T13:30:00.000+01:00")).toBe("13 h 30");
    expect(heureCourte("")).toBe("");
  });

  it("écrit le poids avec une virgule décimale", () => {
    expect(formaterPoids(2)).toBe("2");
    expect(formaterPoids(2.5)).toBe("2,5");
  });
});

describe("ColisEnvoi · destinataire et destination", () => {
  it("écrit un contact comme la planche et le relit à l'identique", () => {
    const contact = { nom: "Maman", telephone: "+237699401822" };
    expect(formaterContact(contact)).toBe("Maman · 6 99 40 18 22");
    expect(lireContact(formaterContact(contact))).toEqual(contact);
  });

  it("lit un numéro camerounais écrit à la main, avec ou sans l'indicatif", () => {
    expect(lireContact("Papa · 699401822")?.telephone).toBe("+237699401822");
    expect(lireContact("Papa · 237 6 99 40 18 22")?.telephone).toBe("+237699401822");
    expect(lireContact("Papa · +237 699 40 18 22")?.telephone).toBe("+237699401822");
    expect(lireContact("Tante Rose · 6 71 00 00 01")).toEqual({
      nom: "Tante Rose",
      telephone: "+237671000001",
    });
  });

  it("garde un numéro étranger tel quel et refuse un numéro trop court ou sans nom", () => {
    expect(formaterTelephone("+33612345678")).toBe("+33612345678");
    expect(lireContact("Marc · +33 6 12 34 56 78")?.telephone).toBe("+33612345678");
    expect(lireContact("Maman · 6 99 40")).toBeNull();
    expect(lireContact("6 99 40 18 22")).toBeNull();
    expect(lireContact("Maman")).toBeNull();
    expect(lireContact("")).toBeNull();
  });

  it("sépare la ville de la gare dans « Où »", () => {
    expect(villeDe("Bafoussam · gare Alpha")).toBe("Bafoussam");
    expect(villeDe("  Yaoundé ")).toBe("Yaoundé");
    expect(villeDe("")).toBe("");
    expect(formaterDestination({ ville: "Bafoussam", gare: "gare Alpha" })).toBe(
      "Bafoussam · gare Alpha",
    );
    expect(formaterDestination({ ville: "Bafoussam", gare: "" })).toBe("Bafoussam");
  });
});

describe("ColisEnvoi · assurance et détail du prix", () => {
  it("applique la règle du domaine : 2 %, minimum 500 F, plafond de la valeur", () => {
    expect(assuranceDe(25_000)).toEqual({ valeurAssuree: 25_000, prime: 500 });
    expect(assuranceDe(100_000)).toEqual({ valeurAssuree: 100_000, prime: 2000 });
    expect(assuranceDe(10_000)).toEqual({ valeurAssuree: 10_000, prime: 500 });
    expect(assuranceDe(900_000)).toEqual({ valeurAssuree: 500_000, prime: 10_000 });
  });

  it("n'assure rien sans valeur", () => {
    expect(assuranceDe(null)).toBeNull();
    expect(assuranceDe(0)).toBeNull();
  });

  it("détaille chaque ligne du devis dans l'ordre, avec le mot de son code", () => {
    const mots = { port: "port", frais_app: "frais", assurance: "assurance" };
    expect(
      detailDuPrix(
        [
          { code: "port", libelle: "Port", montant: 1500 },
          { code: "frais_app", libelle: "Frais AfriMove", montant: 200 },
          { code: "assurance", libelle: "Assurance", montant: 500 },
        ],
        mots,
      ),
    ).toBe("1 500 port + 200 frais + 500 assurance");
  });

  it("garde le libellé en minuscules pour un code inconnu", () => {
    expect(detailDuPrix([{ code: "remise", libelle: "Remise Fidélité", montant: 100 }], {})).toBe(
      "100 remise fidélité",
    );
  });
});

describe("ColisEnvoi · valeurs de la démonstration", () => {
  it("reprennent celles du scénario de la planche dans les fixtures", () => {
    const { formulaire } = ecrans.ColisEnvoi.donnees;
    expect(DEMO_COLIS_ENVOI.contenu).toBe(formulaire.contenu);
    expect(DEMO_COLIS_ENVOI.valeur).toBe(formaterMontant(formulaire.valeur));
  });
});
