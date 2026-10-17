import { describe, expect, it } from "vitest";
import { GARDE_COLIS_JOURS, TARIFS, repartitionRelais } from "../colis/regles";
import {
  GAIN_REMISE_RELAIS,
  GAIN_REPRISE_RELAIS,
  GARDE_RELAIS_JOURS,
  codeDossier,
  codeVille,
  distanceM,
  estOuvert,
  fermeBientot,
  initiales,
  lireHoraires,
  lireTailleMaxKg,
  masquerMomo,
  normaliser,
  operateurProbable,
  versementRelaisDu,
} from "./regles";
import {
  ajouterMinutes,
  debutDeJour,
  debutDeSemaine,
  joursEcoules,
  jourSemaine,
  minutesDuJour,
} from "./temps";

/** Lundi 2 novembre 2026, 09:00 à Douala. */
const LUNDI_9H = "2026-11-02T09:00:00.000+01:00";

describe("règles des points relais", () => {
  it("le gain par remise est la part du relais des tarifs (200 F), la reprise 100 F, la garde 7 jours", () => {
    expect(GAIN_REMISE_RELAIS).toBe(TARIFS.relais.partRelais);
    expect(GAIN_REMISE_RELAIS).toBe(200);
    expect(GAIN_REPRISE_RELAIS).toBe(100);
    expect(GARDE_RELAIS_JOURS).toBe(GARDE_COLIS_JOURS);
    expect(GARDE_RELAIS_JOURS).toBe(7);
    // L'expéditeur paie 300 F, dont 200 F pour le relais.
    expect(repartitionRelais().voyageur).toBe(300);
  });

  it("fabrique les codes de dossier R-BAF-0215 et L-BAF-0087", () => {
    expect(codeVille("Bafoussam")).toBe("BAF");
    expect(codeVille("Yaoundé")).toBe("YAO");
    expect(codeVille("Ké")).toBe("KEX");
    expect(codeDossier("R-BAF", 215)).toBe("R-BAF-0215");
    expect(codeDossier("L-BAF", 87)).toBe("L-BAF-0087");
    expect(codeDossier("R-BAF", 12345)).toBe("R-BAF-12345");
  });

  it("compare les noms sans accents, casse ni ponctuation", () => {
    expect(normaliser("  Tamdja, Djeleng – Centre ")).toBe("tamdja djeleng centre");
    expect(normaliser("Yaoundé")).toBe(normaliser("YAOUNDE"));
    expect(initiales("Éric Tchoua")).toBe("ÉT");
    expect(initiales("  ")).toBe("");
  });

  it("masque le numéro MoMo et devine l'opérateur", () => {
    expect(masquerMomo("+237699401822")).toBe("6 99 •• •• 22");
    expect(masquerMomo("123")).toBe("•• •• ••");
    expect(operateurProbable("+237699401822")).toBe("orange");
    expect(operateurProbable("+237670000111")).toBe("mtn");
    expect(operateurProbable("+237222000111")).toBeNull();
  });

  describe("horaires", () => {
    it("lit les formats de la fiche", () => {
      expect(lireHoraires("7 h – 20 h · lun.–sam.")).toMatchObject({
        ouvreMin: 420,
        fermeMin: 1200,
        jours: [1, 2, 3, 4, 5, 6],
        libelle: "7 h–20 h",
        libelleJours: "lun.–sam.",
      });
      expect(lireHoraires("7 h 30 – 22 h · 7 j / 7")).toMatchObject({
        ouvreMin: 450,
        jours: [0, 1, 2, 3, 4, 5, 6],
        libelleJours: "7 j/7",
      });
      expect(lireHoraires("8 h – 18 h · lun.–ven.")?.jours).toEqual([1, 2, 3, 4, 5]);
    });

    it("refuse ce qui n'est pas des horaires", () => {
      for (const texte of [
        "",
        "tout le temps",
        "20 h – 7 h · lun.–sam.",
        "7 h – 25 h · lun.–sam.",
        "7 h – 20 h",
        "7 h – 20 h · jamais",
      ]) {
        expect(lireHoraires(texte), texte).toBeNull();
      }
    });

    it("dit si le relais est ouvert, et à quelle heure il ferme quand l'heure approche", () => {
      const h = lireHoraires("7 h – 20 h · lun.–sam.")!;
      expect(estOuvert(h, LUNDI_9H)).toBe(true);
      expect(estOuvert(h, "2026-11-02T06:59:00.000+01:00")).toBe(false);
      expect(estOuvert(h, "2026-11-02T07:00:00.000+01:00")).toBe(true);
      expect(estOuvert(h, "2026-11-02T19:59:00.000+01:00")).toBe(true);
      expect(estOuvert(h, "2026-11-02T20:00:00.000+01:00")).toBe(false);
      // Dimanche 1er novembre : fermé.
      expect(estOuvert(h, "2026-11-01T12:00:00.000+01:00")).toBe(false);

      expect(fermeBientot(h, "2026-11-02T13:59:00.000+01:00")).toBeNull();
      expect(fermeBientot(h, "2026-11-02T14:00:00.000+01:00")).toBe(
        "2026-11-02T20:00:00.000+01:00",
      );
      expect(fermeBientot(h, "2026-11-02T21:00:00.000+01:00")).toBeNull();
    });
  });

  it("lit la taille maximale d'un colis", () => {
    expect(lireTailleMaxKg("Petits et moyens (≤ 10 kg)")).toBe(10);
    expect(lireTailleMaxKg("Tous (≤ 30 kg)")).toBe(30);
    expect(lireTailleMaxKg("Petits seulement (≤ 3 kg)")).toBe(3);
    expect(lireTailleMaxKg("tous")).toBeNull();
  });

  it("mesure les distances à vol d'oiseau (Douala – Yaoundé ≈ 200 km)", () => {
    const douala = { lat: 4.0511, lon: 9.7679 };
    const yaounde = { lat: 3.848, lon: 11.5021 };
    expect(distanceM(douala, douala)).toBe(0);
    expect(distanceM(douala, yaounde)).toBeGreaterThan(190_000);
    expect(distanceM(douala, yaounde)).toBeLessThan(200_000);
    expect(distanceM(douala, yaounde)).toBe(distanceM(yaounde, douala));
  });

  it("le versement du lundi est dû à partir de 8 h (heure de Douala) et pas avant", () => {
    const debut = debutDeSemaine(LUNDI_9H);
    expect(debut).toBe("2026-11-02T00:00:00.000+01:00");
    expect(versementRelaisDu("2026-11-02T07:59:59.000+01:00", debut)).toBe(false);
    expect(versementRelaisDu("2026-11-02T08:00:00.000+01:00", debut)).toBe(true);
    // Le dimanche soir appartient encore à la semaine précédente : pas de versement dû pour la suivante.
    const dimanche = "2026-11-01T22:00:00.000+01:00";
    expect(debutDeSemaine(dimanche)).toBe("2026-10-26T00:00:00.000+01:00");
  });
});

describe("temps de Douala", () => {
  it("découpe les jours et les semaines à minuit heure de Douala (UTC+1)", () => {
    // 23 h 30 UTC le dimanche est déjà lundi 00 h 30 à Douala.
    const instant = "2026-11-01T23:30:00.000Z";
    expect(jourSemaine(instant)).toBe(1);
    expect(minutesDuJour(instant)).toBe(30);
    expect(debutDeJour(instant)).toBe("2026-11-02T00:00:00.000+01:00");
    expect(debutDeSemaine(instant)).toBe("2026-11-02T00:00:00.000+01:00");
  });

  it("compte les jours entiers écoulés, jamais négatifs", () => {
    expect(joursEcoules(LUNDI_9H, ajouterMinutes(LUNDI_9H, 24 * 60 - 1))).toBe(0);
    expect(joursEcoules(LUNDI_9H, ajouterMinutes(LUNDI_9H, 24 * 60))).toBe(1);
    expect(joursEcoules(LUNDI_9H, ajouterMinutes(LUNDI_9H, -60))).toBe(0);
  });
});
