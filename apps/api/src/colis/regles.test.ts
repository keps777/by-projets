import { describe, expect, it } from "vitest";
import {
  DELAI_REPONSE_RECLAMATION_JOURS_OUVRES,
  ESSAIS_CODE_MAX,
  GARDE_COLIS_JOURS,
  MULTIPLE_PORT_SI_PERTE,
  RETENTION_PHOTOS_JOURS,
  SEUIL_DEPASSEMENT_KG,
  colisNonRetire,
  complementPoidsRequis,
  devisColis,
  expirationPhoto,
  formaterFcfa,
  limiteRetraitColis,
  plafondIndemnisation,
  primeAssurance,
} from "./regles";
import { ajouterJours, ajouterJoursOuvres } from "./temps";

describe("règles métier du colis (valeurs du cahier des charges)", () => {
  it("garde 7 jours, 3 essais de code, photos 90 jours, réponse 2 jours ouvrés, 10 fois le port", () => {
    expect(GARDE_COLIS_JOURS).toBe(7);
    expect(ESSAIS_CODE_MAX).toBe(3);
    expect(RETENTION_PHOTOS_JOURS).toBe(90);
    expect(DELAI_REPONSE_RECLAMATION_JOURS_OUVRES).toBe(2);
    expect(MULTIPLE_PORT_SI_PERTE).toBe(10);
    expect(SEUIL_DEPASSEMENT_KG).toBe(1);
  });

  it("calcule le prix d'un colis d'app assuré en gare : port 1 500 + frais 200 + prime 500", () => {
    const devis = devisColis({ port: 1500, canal: "app", mode: "gare", valeurAssuree: 25000 });
    expect(devis.lignes.map((l) => [l.code, l.montant])).toEqual([
      ["port", 1500],
      ["frais_app", 200],
      ["assurance", 500],
    ]);
    expect(devis.total).toBe(2200);
  });

  it("n'ajoute pas les frais de l'app au guichet, ajoute 300 F pour un relais et 1 000 F pour une moto", () => {
    expect(devisColis({ port: 1500, canal: "agence", mode: "gare" }).total).toBe(1500);
    expect(devisColis({ port: 1500, canal: "app", mode: "relais" }).total).toBe(2000);
    expect(devisColis({ port: 1500, canal: "app", mode: "moto" }).total).toBe(2700);
    expect(devisColis({ port: 1500, canal: "app", mode: "moto", prixLivraison: 2500 }).total).toBe(
      4200,
    );
  });

  it("refuse une livraison sous 1 000 F et un port négatif", () => {
    expect(() =>
      devisColis({ port: 1500, canal: "app", mode: "moto", prixLivraison: 999 }),
    ).toThrow(RangeError);
    expect(() => devisColis({ port: -1, canal: "app", mode: "gare" })).toThrow(RangeError);
  });

  it("assure 2 % de la valeur, au moins 500 F, jusqu'à 500 000 F", () => {
    expect(primeAssurance(10_000)).toEqual({ valeurAssuree: 10_000, prime: 500 });
    expect(primeAssurance(25_000)).toEqual({ valeurAssuree: 25_000, prime: 500 });
    expect(primeAssurance(100_000)).toEqual({ valeurAssuree: 100_000, prime: 2000 });
    expect(primeAssurance(900_000)).toEqual({ valeurAssuree: 500_000, prime: 10_000 });
    expect(() => primeAssurance(0)).toThrow(RangeError);
  });

  it("exige un complément au-delà de 1 kg de dépassement, pas à 1 kg pile", () => {
    expect(complementPoidsRequis(2, 2.1)).toBe(false);
    expect(complementPoidsRequis(2, 3)).toBe(false);
    expect(complementPoidsRequis(2, 3.01)).toBe(true);
    expect(complementPoidsRequis(2, 1.5)).toBe(false);
  });

  it("garde le colis 7 jours : non retiré à J+7 pile, pas avant", () => {
    const debut = "2026-11-02T09:00:00.000+01:00";
    expect(limiteRetraitColis(debut)).toBe("2026-11-09T09:00:00.000+01:00");
    expect(colisNonRetire(debut, "2026-11-09T08:59:59.999+01:00")).toBe(false);
    expect(colisNonRetire(debut, "2026-11-09T09:00:00.000+01:00")).toBe(true);
  });

  it("supprime les photos 90 jours après la prise de vue", () => {
    expect(expirationPhoto("2026-11-02T09:00:00.000+01:00")).toBe("2027-01-31T09:00:00.000+01:00");
  });

  it("indemnise la valeur assurée si le colis est assuré, sinon 10 fois le port", () => {
    expect(plafondIndemnisation({ assure: true, valeurAssuree: 25_000, port: 1500 })).toEqual({
      type: "valeur_assuree",
      montant: 25_000,
    });
    expect(plafondIndemnisation({ assure: false, valeurAssuree: 0, port: 1500 })).toEqual({
      type: "multiple_port",
      montant: 15_000,
    });
  });

  it("écrit les montants comme les maquettes : « 25 000 F »", () => {
    expect(formaterFcfa(0)).toBe("0 F");
    expect(formaterFcfa(300)).toBe("300 F");
    expect(formaterFcfa(1000)).toBe("1 000 F");
    expect(formaterFcfa(25000)).toBe("25 000 F");
    expect(formaterFcfa(1234567)).toBe("1 234 567 F");
  });
});

describe("jours et heures de Douala", () => {
  it("compte les jours ouvrés sans samedi ni dimanche", () => {
    // Lundi 2 novembre 2026.
    expect(ajouterJoursOuvres("2026-11-02T09:00:00.000+01:00", 2)).toBe(
      "2026-11-04T09:00:00.000+01:00",
    );
    // Vendredi 6 : le week-end saute.
    expect(ajouterJoursOuvres("2026-11-06T09:00:00.000+01:00", 1)).toBe(
      "2026-11-09T09:00:00.000+01:00",
    );
    expect(ajouterJoursOuvres("2026-11-06T09:00:00.000+01:00", 2)).toBe(
      "2026-11-10T09:00:00.000+01:00",
    );
    // Samedi 7 : le premier jour ouvré est le lundi.
    expect(ajouterJoursOuvres("2026-11-07T10:00:00.000+01:00", 1)).toBe(
      "2026-11-09T10:00:00.000+01:00",
    );
    expect(ajouterJoursOuvres("2026-11-02T09:00:00.000+01:00", 0)).toBe(
      "2026-11-02T09:00:00.000+01:00",
    );
  });

  it("ajoute des jours en gardant l'heure de Douala", () => {
    expect(ajouterJours("2026-12-30T23:30:00.000+01:00", 3)).toBe("2027-01-02T23:30:00.000+01:00");
    expect(ajouterJours("2026-11-02T08:00:00.000Z", -1)).toBe("2026-11-01T09:00:00.000+01:00");
  });
});
