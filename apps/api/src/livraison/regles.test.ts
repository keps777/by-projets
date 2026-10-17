import { describe, expect, it } from "vitest";
import type { LivreurStocke } from "./modele";
import {
  ATTENTE_ABSENCE_MINUTES,
  DELAI_ACCEPTATION_SECONDES,
  SEUIL_RETRAIT,
  TARIFS,
  dansLesHeures,
  dureeDeTrajet,
  encoreValable,
  gainLivreur,
  libelleAssurance,
  libellePermis,
  lireChargeKg,
  lireHeures,
  lireZone,
  livreurConvient,
  piecesAJour,
  repartitionLivraison,
} from "./regles";

/** Lundi 2 novembre 2026, 09:00 à Douala. */
const LUNDI_9H = "2026-11-02T09:00:00.000+01:00";
const LUNDI_18H = "2026-11-02T18:00:00.000+01:00";
const SAMEDI_10H = "2026-11-07T10:00:00.000+01:00";

const LIVREUR: Pick<
  LivreurStocke,
  "actif" | "disponible" | "zone" | "heures" | "chargeMax" | "deplacement" | "pieces"
> = {
  actif: true,
  disponible: true,
  zone: "Bafoussam · Tamdja, Djeleng, centre",
  heures: "Soirs 17 h – 21 h",
  chargeMax: "10 kg · colis courants",
  deplacement: "moto",
  pieces: {
    permisRef: "p",
    assuranceRef: "a",
    permisValideJusqua: "2030-01-31",
    assuranceExpireLe: "2027-12-31",
  },
};

const CIBLE = { ville: "Bafoussam", adresse: "Rue de Tamdja, face au marché", poidsKg: 2 };

describe("règles de la livraison moto", () => {
  it("les délais et seuils du cahier des charges", () => {
    expect(DELAI_ACCEPTATION_SECONDES).toBe(30);
    expect(ATTENTE_ABSENCE_MINUTES).toBe(10);
    expect(SEUIL_RETRAIT).toBe(5000);
  });

  it("le livreur gagne 70 % du prix de la livraison, arrondi à l'inférieur : 700 F sur 1 000 F", () => {
    expect(TARIFS.livraison.partLivreurPct).toBe(70);
    expect(gainLivreur(1000)).toBe(700);
    expect(gainLivreur(1001)).toBe(700);
    expect(gainLivreur(1500)).toBe(1050);
    expect(gainLivreur(1999)).toBe(1399);
    // En dessous du minimum, le minimum s'applique : jamais de gain négatif ni nul.
    expect(gainLivreur(500)).toBe(700);
    for (const prix of [1000, 1234, 2500, 10_000]) {
      const { livreur, afrimove } = repartitionLivraison(prix);
      expect(gainLivreur(prix)).toBe(livreur);
      expect(livreur + afrimove).toBe(prix);
    }
  });

  it("estime la durée du trajet à 300 m par minute, au moins une minute", () => {
    expect(dureeDeTrajet(4100)).toBe(14);
    expect(dureeDeTrajet(3000)).toBe(10);
    expect(dureeDeTrajet(1)).toBe(1);
    expect(dureeDeTrajet(0)).toBe(1);
  });

  describe("zone", () => {
    it("lit la ville et les quartiers", () => {
      expect(lireZone("Bafoussam · Tamdja, Djeleng, centre")).toEqual({
        ville: "Bafoussam",
        secteurs: ["tamdja", "djeleng", "centre"],
      });
      expect(lireZone("Bafoussam · toute la ville")).toEqual({
        ville: "Bafoussam",
        secteurs: null,
      });
      expect(lireZone("Douala")).toEqual({ ville: "Douala", secteurs: null });
      expect(lireZone("Yaoundé · Mvan, Biyem-Assi")?.secteurs).toEqual(["mvan", "biyem assi"]);
    });

    it("refuse une zone vide", () => {
      expect(lireZone("")).toBeNull();
      expect(lireZone("·")).toBeNull();
      expect(lireZone("Bafoussam · , ,")).toBeNull();
    });
  });

  describe("heures", () => {
    it("lit les plages, la journée entière et les week-ends", () => {
      expect(lireHeures("Soirs 17 h – 21 h")).toMatchObject({ debutMin: 1020, finMin: 1260 });
      expect(lireHeures("Matins 6 h – 12 h")).toMatchObject({ debutMin: 360, finMin: 720 });
      expect(lireHeures("Toute la journée")).toMatchObject({ debutMin: 0, finMin: 1440 });
      expect(lireHeures("Week-ends")?.jours).toEqual([6, 0]);
      expect(lireHeures("17 h 30 - 21 h")).toMatchObject({ debutMin: 1050 });
    });

    it("refuse des heures illisibles ou à l'envers", () => {
      for (const texte of ["", "quand je peux", "21 h – 17 h", "17 h – 25 h"]) {
        expect(lireHeures(texte), texte).toBeNull();
      }
    });

    it("dit si l'instant tombe dans les heures du livreur", () => {
      const soir = lireHeures("Soirs 17 h – 21 h")!;
      expect(dansLesHeures(soir, LUNDI_9H)).toBe(false);
      expect(dansLesHeures(soir, "2026-11-02T16:59:00.000+01:00")).toBe(false);
      expect(dansLesHeures(soir, "2026-11-02T17:00:00.000+01:00")).toBe(true);
      expect(dansLesHeures(soir, "2026-11-02T20:59:00.000+01:00")).toBe(true);
      expect(dansLesHeures(soir, "2026-11-02T21:00:00.000+01:00")).toBe(false);
      const week = lireHeures("Week-ends")!;
      expect(dansLesHeures(week, LUNDI_9H)).toBe(false);
      expect(dansLesHeures(week, SAMEDI_10H)).toBe(true);
      expect(dansLesHeures(week, "2026-11-08T10:00:00.000+01:00")).toBe(true);
    });
  });

  it("lit la charge en kilos", () => {
    expect(lireChargeKg("10 kg · colis courants")).toBe(10);
    expect(lireChargeKg("30 kg · gros colis (tricycle)")).toBe(30);
    expect(lireChargeKg("3 kg · petits colis")).toBe(3);
    expect(lireChargeKg("beaucoup")).toBeNull();
  });

  describe("à qui proposer une mission", () => {
    it("convient quand tout correspond : actif, en ligne, quartier, heures, charge", () => {
      expect(livreurConvient(LIVREUR, CIBLE, LUNDI_18H)).toBe(true);
    });

    it("chaque critère écarte le livreur", () => {
      const sansCe = (over: Partial<typeof LIVREUR>, cible = CIBLE, instant = LUNDI_18H) =>
        livreurConvient({ ...LIVREUR, ...over }, cible, instant);
      expect(sansCe({ actif: false })).toBe(false);
      expect(sansCe({ disponible: false })).toBe(false);
      expect(sansCe({}, { ...CIBLE, ville: "Douala" })).toBe(false);
      expect(sansCe({}, { ...CIBLE, adresse: "Quartier Mvan" })).toBe(false);
      expect(sansCe({}, CIBLE, LUNDI_9H)).toBe(false);
      expect(sansCe({}, { ...CIBLE, poidsKg: 10.5 })).toBe(false);
      expect(sansCe({}, { ...CIBLE, poidsKg: 10 })).toBe(true);
      expect(sansCe({ zone: "" })).toBe(false);
      expect(sansCe({ heures: "?" })).toBe(false);
      expect(sansCe({ chargeMax: "?" })).toBe(false);
    });

    it("ne confond pas les villes ni les accents, et sans adresse seule la ville entière convient", () => {
      expect(
        livreurConvient(
          { ...LIVREUR, zone: "Yaoundé · Mvan" },
          { ...CIBLE, ville: "YAOUNDE", adresse: "Mvan" },
          LUNDI_18H,
        ),
      ).toBe(true);
      expect(livreurConvient(LIVREUR, { ...CIBLE, adresse: null }, LUNDI_18H)).toBe(false);
      expect(
        livreurConvient(
          { ...LIVREUR, zone: "Bafoussam · toute la ville" },
          { ...CIBLE, adresse: null },
          LUNDI_18H,
        ),
      ).toBe(true);
    });

    it("n'accepte pas un livreur à moto dont le permis ou l'assurance est périmé", () => {
      const perime = { ...LIVREUR.pieces, assuranceExpireLe: "2026-11-01" };
      expect(livreurConvient({ ...LIVREUR, pieces: perime }, CIBLE, LUNDI_18H)).toBe(false);
      const sansDate = { ...LIVREUR.pieces, permisValideJusqua: null };
      expect(livreurConvient({ ...LIVREUR, pieces: sansDate }, CIBLE, LUNDI_18H)).toBe(false);
      // À vélo il n'y a rien à présenter.
      expect(
        livreurConvient({ ...LIVREUR, deplacement: "velo", pieces: sansDate }, CIBLE, LUNDI_18H),
      ).toBe(true);
    });
  });

  it("une pièce vaut jusqu'à minuit de son dernier jour, heure de Douala", () => {
    expect(encoreValable("2026-11-02", "2026-11-02T23:59:00.000+01:00")).toBe(true);
    expect(encoreValable("2026-11-02", "2026-11-03T00:00:00.000+01:00")).toBe(false);
    expect(piecesAJour(LIVREUR, LUNDI_9H)).toBe(true);
    expect(
      piecesAJour(
        { ...LIVREUR, pieces: { ...LIVREUR.pieces, permisValideJusqua: "2026-11-01" } },
        LUNDI_9H,
      ),
    ).toBe(false);
  });

  it("écrit les pièces comme l'écran du livreur", () => {
    expect(libellePermis("2030-01-31")).toBe("valide 2030");
    expect(libelleAssurance("2027-02-28")).toBe("expire 02/27");
  });
});
