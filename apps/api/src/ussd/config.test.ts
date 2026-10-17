import { describe, expect, it } from "vitest";
import { ConfigUssdInvalide, chargerConfigUssd } from "./config";

const JETON = "un-jeton-de-production-assez-long-0123456789";

const erreurs = (env: Record<string, string>, production = false): readonly string[] => {
  try {
    chargerConfigUssd(env, production);
  } catch (e) {
    if (e instanceof ConfigUssdInvalide) return e.erreurs;
    throw e;
  }
  return [];
};

describe("configuration USSD", () => {
  it("les valeurs par défaut conviennent au développement : aucun connecteur actif", () => {
    expect(chargerConfigUssd({})).toEqual({
      codeService: "*123#",
      sessionTtlMs: 120_000,
      trajetDefaut: { depart: "DLA", arrivee: "YDE" },
      nombreDeparts: 3,
      codeSansFrais: "USSD",
      baseLienBillet: "https://afrimove.app/b/",
      balayageMs: 10_000,
      abandonApresMs: 180_000,
      erreursMax: 3,
      jetons: { mtn: null, orange: null },
      production: false,
    });
  });

  it("lit les réglages et les jetons des deux connecteurs", () => {
    const c = chargerConfigUssd(
      {
        USSD_MTN_JETON: JETON,
        USSD_ORANGE_JETON: `${JETON}-orange`,
        USSD_TRAJET_DEFAUT: "BFM>DLA",
        USSD_NOMBRE_DEPARTS: "4",
        USSD_SESSION_TTL_S: "60",
        USSD_ABANDON_MARGE_S: "30",
        USSD_CODE_SANS_FRAIS: "SANSFRAIS",
      },
      true,
    );
    expect(c.jetons).toEqual({ mtn: JETON, orange: `${JETON}-orange` });
    expect(c.trajetDefaut).toEqual({ depart: "BFM", arrivee: "DLA" });
    expect(c.nombreDeparts).toBe(4);
    expect(c.sessionTtlMs).toBe(60_000);
    expect(c.abandonApresMs).toBe(90_000);
    expect(c.codeSansFrais).toBe("SANSFRAIS");
    expect(c.production).toBe(true);
  });

  it("liste toutes les erreurs d'un coup", () => {
    expect(
      erreurs({
        USSD_CODE_SERVICE: "123",
        USSD_TRAJET_DEFAUT: "Douala-Yaounde",
        USSD_NOMBRE_DEPARTS: "9",
        USSD_MTN_JETON: "court",
        USSD_BASE_LIEN_BILLET: "http://afrimove.app/b",
        USSD_CODE_SANS_FRAIS: "un code avec espaces",
      }),
    ).toEqual([
      "USSD_CODE_SERVICE : forme *123#",
      "USSD_TRAJET_DEFAUT : deux codes de ville, par exemple DLA>YDE",
      "USSD_CODE_SANS_FRAIS : 2 à 20 lettres ou chiffres",
      "USSD_BASE_LIEN_BILLET : adresse https terminée par « / », 40 caractères au plus",
      "USSD_MTN_JETON : 32 caractères au moins",
      "USSD_NOMBRE_DEPARTS doit être un entier entre 1 et 5",
    ]);
  });

  it("refuse un trajet par défaut dont le départ est l'arrivée", () => {
    expect(erreurs({ USSD_TRAJET_DEFAUT: "DLA>DLA" })).toEqual([
      "USSD_TRAJET_DEFAUT : départ et arrivée doivent différer",
    ]);
  });

  it("deux connecteurs ne peuvent pas partager un jeton", () => {
    expect(erreurs({ USSD_MTN_JETON: JETON, USSD_ORANGE_JETON: JETON })).toEqual([
      "USSD_MTN_JETON et USSD_ORANGE_JETON doivent différer",
    ]);
  });

  it("en production, au moins un connecteur, et jamais un jeton d'exemple", () => {
    expect(erreurs({}, true)).toEqual([
      "USSD_MTN_JETON ou USSD_ORANGE_JETON est obligatoire en production",
    ]);
    expect(erreurs({ USSD_MTN_JETON: "jeton-dev-seulement-0123456789abcdefghij" }, true)).toEqual([
      "USSD_MTN_JETON porte une valeur d'exemple : interdit en production",
    ]);
    expect(erreurs({ USSD_ORANGE_JETON: JETON }, true)).toEqual([]);
  });
});
