import { describe, expect, it } from "vitest";
import { ConfigWhatsAppInvalide, chargerConfigWhatsApp } from "./config";

const HTTP = {
  WHATSAPP_FOURNISSEUR: "http",
  WHATSAPP_API_URL: "https://graph.facebook.com/v21.0",
  WHATSAPP_TOKEN: "jeton-d-acces-de-production-0123456789",
  WHATSAPP_PHONE_ID: "109876543210",
  WHATSAPP_WABA_ID: "208765432109",
  WHATSAPP_APP_SECRET: "secret-application-de-production-0123",
  WHATSAPP_VERIFY_TOKEN: "jeton-de-verification-de-production",
};

const erreurs = (env: Record<string, string>, production = false): readonly string[] => {
  try {
    chargerConfigWhatsApp(env, production);
  } catch (e) {
    if (e instanceof ConfigWhatsAppInvalide) return e.erreurs;
    throw e;
  }
  return [];
};

describe("configuration WhatsApp", () => {
  it("les valeurs par défaut conviennent au développement : simulé, repli SMS, rapport à 21 h", () => {
    expect(chargerConfigWhatsApp({})).toEqual({
      langue: "fr",
      tentativesMax: 4,
      reprisePremiereMs: 5000,
      concurrence: 5,
      sondageMs: 250,
      delaiFournisseurMs: 10_000,
      disjoncteur: { seuilEchecs: 3, ouvertureMs: 30_000 },
      limites: { parDemandeurParHeure: 60, parDestinataireParHeure: 10 },
      fournisseur: { type: "simule" },
      secoursSms: true,
      journaliserContenuSimule: false,
      rapport: { minutesDepart: 21 * 60, validiteMs: 6 * 3_600_000, planificateurMs: 30_000 },
      fenetreDelaiReponseMs: 7 * 24 * 3_600_000,
      production: false,
    });
  });

  it("lit un fournisseur HTTP complet", () => {
    const c = chargerConfigWhatsApp(HTTP, true);
    expect(c.fournisseur).toEqual({
      type: "http",
      urlApi: "https://graph.facebook.com/v21.0",
      jeton: HTTP.WHATSAPP_TOKEN,
      numeroId: "109876543210",
      compteId: "208765432109",
      secretApplication: HTTP.WHATSAPP_APP_SECRET,
      jetonVerification: HTTP.WHATSAPP_VERIFY_TOKEN,
    });
    expect(c.production).toBe(true);
  });

  it("liste toutes les erreurs d'un coup", () => {
    expect(erreurs({ WHATSAPP_FOURNISSEUR: "http" })).toEqual([
      "WHATSAPP_API_URL : adresse https",
      "WHATSAPP_TOKEN : 16 caractères au moins",
      "WHATSAPP_PHONE_ID : identifiant numérique",
      "WHATSAPP_WABA_ID : identifiant numérique",
      "WHATSAPP_APP_SECRET : 16 caractères au moins",
      "WHATSAPP_VERIFY_TOKEN : 16 caractères au moins",
    ]);
  });

  it("refuse une adresse sans https, un fournisseur inconnu, une langue ou une heure mal écrites", () => {
    expect(erreurs({ ...HTTP, WHATSAPP_API_URL: "http://graph.example/v21.0" })).toEqual([
      "WHATSAPP_API_URL : adresse https",
    ]);
    expect(erreurs({ WHATSAPP_FOURNISSEUR: "twilio" })).toEqual([
      "WHATSAPP_FOURNISSEUR : « simule » ou « http »",
    ]);
    expect(erreurs({ WHATSAPP_LANGUE: "Français" })).toEqual([
      "WHATSAPP_LANGUE : code de langue WhatsApp (fr, en, fr_FR…)",
    ]);
    expect(erreurs({ WHATSAPP_RAPPORT_HEURE: "9h" })).toEqual([
      "WHATSAPP_RAPPORT_HEURE : HH:MM (heure de Douala)",
    ]);
    expect(erreurs({ WHATSAPP_RAPPORT_HEURE: "24:00" })).toHaveLength(1);
  });

  it("lit l'heure du rapport en minutes depuis minuit", () => {
    expect(chargerConfigWhatsApp({ WHATSAPP_RAPPORT_HEURE: "20:45" }).rapport.minutesDepart).toBe(
      1245,
    );
    expect(chargerConfigWhatsApp({ WHATSAPP_RAPPORT_HEURE: "00:00" }).rapport.minutesDepart).toBe(
      0,
    );
  });

  it("borne les réglages numériques et les booléens", () => {
    expect(erreurs({ WHATSAPP_TENTATIVES_MAX: "0" })).toEqual([
      "WHATSAPP_TENTATIVES_MAX doit être un entier entre 1 et 12",
    ]);
    expect(erreurs({ WHATSAPP_REPRISE_MS: "abc" })).toHaveLength(1);
    expect(erreurs({ WHATSAPP_RAPPORT_VALIDITE_H: "24" })).toHaveLength(1);
    expect(erreurs({ WHATSAPP_SECOURS_SMS: "peut-être" })).toEqual([
      "WHATSAPP_SECOURS_SMS : « true » ou « false »",
    ]);
    expect(chargerConfigWhatsApp({ WHATSAPP_SECOURS_SMS: "non" }).secoursSms).toBe(false);
    expect(
      chargerConfigWhatsApp({ WHATSAPP_TENTATIVES_MAX: "6", WHATSAPP_REPRISE_MS: "2000" }),
    ).toMatchObject({
      tentativesMax: 6,
      reprisePremiereMs: 2000,
    });
  });

  it("en production : fournisseur simulé, valeurs d'exemple et journalisation du contenu sont interdits", () => {
    expect(erreurs({}, true)).toEqual(["WHATSAPP_FOURNISSEUR=simule est interdit en production"]);
    expect(erreurs({ ...HTTP, WHATSAPP_TOKEN: "dev-seulement-jeton-0123456789" }, true)).toEqual([
      "WHATSAPP_TOKEN porte une valeur d'exemple : interdit en production",
    ]);
    expect(
      erreurs({ ...HTTP, WHATSAPP_APP_SECRET: "dev-seulement-secret-012345" }, true),
    ).toHaveLength(1);
    expect(erreurs({ ...HTTP, WHATSAPP_MOCK_LOG_CONTENU: "true" }, true)).toEqual([
      "WHATSAPP_MOCK_LOG_CONTENU est interdit en production",
    ]);
    expect(erreurs({ ...HTTP, WHATSAPP_MOCK_LOG_CONTENU: "true" }, false)).toEqual([]);
  });
});
