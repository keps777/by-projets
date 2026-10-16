import { describe, expect, it } from "vitest";
import type { Arret } from "./entites";
import {
  devisBillet,
  devisColis,
  devisCovoit,
  factureAgence,
  primeAssurance,
  prixProrata,
  repartitionLivraison,
  repartitionRelais,
  TARIFS,
} from "./tarifs";

describe("constantes du document projet", () => {
  it("reprennent les montants du ticket", () => {
    expect(TARIFS.fraisAgenceBillet).toBe(75);
    expect(TARIFS.fraisAgenceColis).toBe(150);
    expect(TARIFS.fraisVoyageurEnLigne).toBe(250);
    expect(TARIFS.fraisColisApp).toBe(200);
    expect(TARIFS.covoitParPlace).toBe(250);
    expect(TARIFS.relais).toEqual({ supplement: 300, partRelais: 200 });
    expect(TARIFS.livraison).toEqual({ minimum: 1000, partLivreurPct: 70 });
    expect(TARIFS.assurance).toEqual({ tauxPct: 2, minimum: 500, plafondValeur: 500_000 });
  });
});

describe("assurance : 2 % de la valeur, minimum 500 F, plafond 500 000 F", () => {
  it.each([
    [1, 500],
    [10_000, 500],
    [25_000, 500], // exemple de la maquette : assurer à 25 000 F coûte 500 F
    [25_001, 501], // arrondi au FCFA supérieur
    [30_000, 600],
    [100_000, 2000],
    [500_000, 10_000],
  ])("valeur %i → prime %i", (valeur, prime) => {
    expect(primeAssurance(valeur).prime).toBe(prime);
  });

  it("plafonne la valeur assurée à 500 000 F", () => {
    expect(primeAssurance(2_000_000)).toEqual({ valeurAssuree: 500_000, prime: 10_000 });
    expect(primeAssurance(499_999).valeurAssuree).toBe(499_999);
  });

  it("refuse une valeur nulle, négative ou non entière", () => {
    expect(() => primeAssurance(0)).toThrow(RangeError);
    expect(() => primeAssurance(-5)).toThrow(RangeError);
    expect(() => primeAssurance(1000.5)).toThrow(RangeError);
  });
});

describe("devis colis : port + frais + assurance + option, ligne par ligne", () => {
  it("exemple de la maquette : 1 500 port + 200 frais + 500 assurance = 2 200 F", () => {
    const d = devisColis({ port: 1500, canal: "app", mode: "gare", valeurAssuree: 25_000 });
    expect(d.lignes.map((l) => [l.code, l.montant])).toEqual([
      ["port", 1500],
      ["frais_app", 200],
      ["assurance", 500],
    ]);
    expect(d.total).toBe(2200);
  });

  it("au guichet, pas de frais app : l'agence paie ses 150 F à AfriMove", () => {
    const d = devisColis({ port: 1500, canal: "agence", mode: "gare" });
    expect(d.lignes.map((l) => l.code)).toEqual(["port"]);
    expect(d.total).toBe(1500);
  });

  it("relais : +300 F", () => {
    expect(devisColis({ port: 1500, canal: "app", mode: "relais" }).total).toBe(1500 + 200 + 300);
  });

  it("moto : livraison dès 1 000 F", () => {
    expect(devisColis({ port: 1500, canal: "app", mode: "moto" }).total).toBe(1500 + 200 + 1000);
    expect(devisColis({ port: 1500, canal: "app", mode: "moto", prixLivraison: 1800 }).total).toBe(
      1500 + 200 + 1800,
    );
    expect(() =>
      devisColis({ port: 1500, canal: "app", mode: "moto", prixLivraison: 900 }),
    ).toThrow(RangeError);
  });

  it("le total est toujours la somme des lignes", () => {
    const d = devisColis({
      port: 2000,
      canal: "app",
      mode: "moto",
      valeurAssuree: 80_000,
      prixLivraison: 1500,
    });
    expect(d.total).toBe(d.lignes.reduce((s, l) => s + l.montant, 0));
    expect(d.total).toBe(2000 + 200 + 1600 + 1500);
  });

  it("refuse un port non entier", () => {
    expect(() => devisColis({ port: 1500.5, canal: "app", mode: "gare" })).toThrow(RangeError);
  });
});

describe("relais et livraison : qui touche quoi", () => {
  it("relais : 300 F payés, dont 200 F au relais et 100 F à AfriMove", () => {
    expect(repartitionRelais()).toEqual({ voyageur: 300, relais: 200, afrimove: 100 });
  });

  it("livraison : 1 000 F dont 700 F (70 %) pour le livreur", () => {
    expect(repartitionLivraison(1000)).toEqual({ livreur: 700, afrimove: 300 });
  });

  it("livraison : la part du livreur est arrondie à l'inférieur, rien ne se perd", () => {
    const r = repartitionLivraison(1250);
    expect(r.livreur).toBe(875);
    const r2 = repartitionLivraison(1005);
    expect(r2.livreur).toBe(703);
    expect(r2.livreur + r2.afrimove).toBe(1005);
    expect(() => repartitionLivraison(999)).toThrow(RangeError);
  });
});

describe("billet en ligne et covoiturage", () => {
  it("billet en ligne : prix + 250 F de frais voyageur", () => {
    expect(devisBillet(4000, true).total).toBe(4250);
    expect(devisBillet(4000, false).total).toBe(4000);
  });

  it("covoit : 250 F par place", () => {
    expect(devisCovoit(3000, 1).total).toBe(3250);
    const d = devisCovoit(3000, 3);
    expect(d.lignes.find((l) => l.code === "frais")?.montant).toBe(750);
    expect(d.total).toBe(9750);
    expect(() => devisCovoit(3000, 0)).toThrow(RangeError);
  });
});

describe("facture hebdomadaire de l'agence : 75 F / billet, 150 F / colis", () => {
  it("ne facture ni les billets annulés ni les simples réservations", () => {
    const f = factureAgence(
      [
        { etat: "paye" },
        { etat: "embarque" },
        { etat: "voyage" },
        { etat: "non_presente" },
        { etat: "reporte" },
        { etat: "annule" },
        { etat: "annule" },
        { etat: "reserve" },
      ],
      4,
    );
    expect(f).toEqual({
      billets: 5,
      colis: 4,
      montantBillets: 375,
      montantColis: 600,
      total: 975,
    });
  });
});

describe("prix au prorata des arrêts", () => {
  const arrets: Arret[] = [
    { id: "dla", nom: "Douala", kmDepuisOrigine: 0, montee: true },
    { id: "pouma", nom: "Pouma", kmDepuisOrigine: 70, montee: true },
    { id: "eseka", nom: "Éséka", kmDepuisOrigine: 140, montee: true },
    { id: "yde", nom: "Yaoundé", kmDepuisOrigine: 280, montee: true },
  ];

  it("le trajet complet coûte le prix complet", () => {
    expect(
      prixProrata({ arrets, prixTrajetComplet: 4000, depuisArretId: "dla", versArretId: "yde" }),
    ).toBe(4000);
  });

  it("au prorata des kilomètres, arrondi à 100 F", () => {
    // 70 km sur 280 = 25 % de 4 000 = 1 000.
    expect(
      prixProrata({ arrets, prixTrajetComplet: 4000, depuisArretId: "dla", versArretId: "pouma" }),
    ).toBe(1000);
    // 210 km sur 280 = 75 % de 4 000 = 3 000.
    expect(
      prixProrata({ arrets, prixTrajetComplet: 4000, depuisArretId: "pouma", versArretId: "yde" }),
    ).toBe(3000);
    // 140 km sur 280 de 3 500 = 1 750 → arrondi proche à 100 F : 1 800.
    expect(
      prixProrata({ arrets, prixTrajetComplet: 3500, depuisArretId: "dla", versArretId: "eseka" }),
    ).toBe(1800);
  });

  it("les deux morceaux d'un trajet ne dépassent jamais le prix complet de plus de l'arrondi", () => {
    const a = prixProrata({
      arrets,
      prixTrajetComplet: 4500,
      depuisArretId: "dla",
      versArretId: "pouma",
    });
    const b = prixProrata({
      arrets,
      prixTrajetComplet: 4500,
      depuisArretId: "pouma",
      versArretId: "yde",
    });
    expect(a + b).toBeLessThanOrEqual(4500 + 100);
  });

  it("un prix fixé par l'agence l'emporte sur le calcul", () => {
    expect(
      prixProrata({
        arrets,
        prixTrajetComplet: 4000,
        depuisArretId: "pouma",
        versArretId: "yde",
        prixFixes: { "pouma>yde": 2500 },
      }),
    ).toBe(2500);
  });

  it("refuse un arrêt inconnu ou un sens inverse", () => {
    expect(() =>
      prixProrata({ arrets, prixTrajetComplet: 4000, depuisArretId: "xxx", versArretId: "yde" }),
    ).toThrow(RangeError);
    expect(() =>
      prixProrata({ arrets, prixTrajetComplet: 4000, depuisArretId: "yde", versArretId: "dla" }),
    ).toThrow(RangeError);
  });
});
