import { describe, expect, it } from "vitest";
import {
  decouperRegles,
  dureeInitialeMs,
  formaterDecompte,
  formaterKilometres,
  formaterMontant,
  formaterNote,
  formaterPoids,
  montantCourt,
  restantMs,
  tonPiece,
} from "./formats";

describe("Livreur · formats", () => {
  it("écrit les montants avec des espaces et les milliers en k", () => {
    expect(formaterMontant(4900)).toBe("4 900");
    expect(formaterMontant(700)).toBe("700");
    expect(formaterMontant(1250000)).toBe("1 250 000");
    expect(montantCourt(31000)).toBe("31 k");
    expect(montantCourt(31500)).toBe("31,5 k");
    expect(montantCourt(700)).toBe("700");
  });

  it("écrit la note, le poids et la distance avec une virgule", () => {
    expect(formaterNote(4.9)).toBe("4,9");
    expect(formaterNote(5)).toBe("5,0");
    expect(formaterPoids(2)).toBe("2");
    expect(formaterPoids(2.5)).toBe("2,5");
    expect(formaterKilometres(4100)).toBe("4,1");
    expect(formaterKilometres(4000)).toBe("4");
    expect(formaterKilometres(850)).toBe("0,9");
  });

  it("écrit le décompte en minutes:secondes", () => {
    expect(formaterDecompte(24)).toBe("0:24");
    expect(formaterDecompte(24.2)).toBe("0:25");
    expect(formaterDecompte(5)).toBe("0:05");
    expect(formaterDecompte(0)).toBe("0:00");
    expect(formaterDecompte(-3)).toBe("0:00");
    expect(formaterDecompte(90)).toBe("1:30");
  });

  describe("dureeInitialeMs", () => {
    const expireA = "2027-01-05T13:06:24.000+01:00";
    const debut = (heure: string) => Date.parse(`2027-01-05T${heure}+01:00`);

    it("reprend la durée restante donnée par le serveur", () => {
      expect(dureeInitialeMs(expireA, 30, debut("13:06:00"))).toBe(24_000);
      expect(dureeInitialeMs(expireA, 30, debut("13:06:20"))).toBe(4_000);
    });

    it("repart du délai complet quand l'horloge de l'appareil n'est pas celle du serveur", () => {
      // l'appareil retarde de plusieurs heures
      expect(dureeInitialeMs(expireA, 30, debut("07:38:00"))).toBe(30_000);
      // l'appareil avance : l'instant d'expiration est déjà passé
      expect(dureeInitialeMs(expireA, 30, debut("13:10:00"))).toBe(30_000);
      expect(dureeInitialeMs("pas une date", 30, debut("13:06:00"))).toBe(30_000);
    });
  });

  it("ne descend jamais sous zéro et ignore une horloge qui recule", () => {
    expect(restantMs(24_000, 10_000)).toBe(14_000);
    expect(restantMs(24_000, 30_000)).toBe(0);
    expect(restantMs(24_000, -5_000)).toBe(24_000);
  });

  it("découpe les règles en numéros et en phrases, sans rien perdre", () => {
    const texte =
      "1. Jamais de remise sans code. 2. Jamais de code demandé par téléphone. 3. Photo du colis remis, jamais de la pièce. Absent : 10 min, puis relais le plus proche.";
    const morceaux = decouperRegles(texte);
    expect(morceaux.filter((m) => m.numero).map((m) => m.texte)).toEqual(["1.", "2.", "3."]);
    expect(morceaux.map((m) => m.texte).join("")).toBe(texte);
    expect(decouperRegles("Pas de numéro, 10 min d'attente.")).toEqual([
      { numero: false, texte: "Pas de numéro, 10 min d'attente." },
    ]);
  });

  it("met en ambre la pièce qui expire, en vert les autres", () => {
    expect(tonPiece("expire 02/27")).toBe("ambre");
    expect(tonPiece("valide 2028")).toBe("vert");
    expect(tonPiece("n° 23")).toBe("vert");
  });
});
