import { describe, expect, it } from "vitest";
import { ConfigSmsInvalide, chargerConfigSms } from "./config";

const HTTP = {
  SMS_FOURNISSEUR: "http",
  SMS_API_URL: "https://api.sms.example/v1",
  SMS_API_KEY: "cle-api-de-production-0123456789",
  SMS_WEBHOOK_SECRET: "w".repeat(40),
  SMS_HOTES_LIENS: "afrimove.app",
};

const erreurs = (env: Record<string, string>, prod = false): string[] => {
  try {
    chargerConfigSms(env, prod);
  } catch (e) {
    if (e instanceof ConfigSmsInvalide) return [...e.erreurs];
    throw e;
  }
  return [];
};

describe("chargerConfigSms", () => {
  it("valeurs par défaut : expéditeur AfriMove, 12 F le morceau, fournisseur simulé", () => {
    const c = chargerConfigSms({});
    expect(c).toMatchObject({
      expediteur: "AfriMove",
      coutParSegmentFcfa: 12,
      objectifDelaiMedianMs: 5000,
      tentativesMax: 6,
      reprisePremiereMs: 3000,
      sondageMs: 250,
      production: false,
      fournisseurs: { principal: { type: "simule", nom: "simule" }, secours: null },
    });
    expect(c.limites).toEqual({
      parDemandeurParHeure: 60,
      parDestinataireParHeure: 10,
      renvoisBilletMax: 2,
    });
  });

  it("lit les variables SMS_*", () => {
    const c = chargerConfigSms({
      ...HTTP,
      SMS_EXPEDITEUR: "AfriGo",
      SMS_COUT_SEGMENT_FCFA: "15",
      SMS_TENTATIVES_MAX: "3",
      SMS_HOTES_LIENS: "Afrimove.app, b.afrimove.app",
      SMS_SECOURS_FOURNISSEUR: "simule",
    });
    expect(c.expediteur).toBe("AfriGo");
    expect(c.coutParSegmentFcfa).toBe(15);
    expect(c.tentativesMax).toBe(3);
    expect(c.hotesLiens).toEqual(["afrimove.app", "b.afrimove.app"]);
    expect(c.fournisseurs.principal).toMatchObject({ type: "http", nom: "agregateur" });
    expect(c.fournisseurs.secours).toEqual({ type: "simule", nom: "secours" });
  });

  it("signale toutes les erreurs d'un coup, sans recopier les secrets", () => {
    const e = erreurs({
      SMS_EXPEDITEUR: "Afri Move Sas Plus",
      SMS_COUT_SEGMENT_FCFA: "douze",
      SMS_TENTATIVES_MAX: "0",
      SMS_FOURNISSEUR: "http",
      SMS_API_URL: "http://pas-https",
      SMS_API_KEY: "courte",
      SMS_WEBHOOK_SECRET: "courte",
    });
    expect(e.length).toBeGreaterThanOrEqual(6);
    expect(e.join("\n")).not.toContain("courte");
  });

  it("refuse un fournisseur inconnu et deux fournisseurs de même nom", () => {
    expect(erreurs({ SMS_FOURNISSEUR: "magie" }).join()).toContain("SMS_FOURNISSEUR");
    expect(
      erreurs({ SMS_SECOURS_FOURNISSEUR: "simule", SMS_SECOURS_FOURNISSEUR_NOM: "simule" }).join(),
    ).toContain("doit différer");
  });

  it("l'expéditeur : 11 caractères alphanumériques au plus", () => {
    expect(erreurs({ SMS_EXPEDITEUR: "AfriMove" })).toEqual([]);
    for (const mauvais of ["", "AfriMove2027X", "Afri Move", "12345", "Afri-Move"]) {
      if (mauvais === "") continue;
      expect(erreurs({ SMS_EXPEDITEUR: mauvais }).join(), mauvais).toContain("SMS_EXPEDITEUR");
    }
  });
});

describe("production", () => {
  it("accepte un agrégateur réel configuré, avec les domaines de lien", () => {
    expect(erreurs(HTTP, true)).toEqual([]);
    expect(chargerConfigSms(HTTP, true).production).toBe(true);
  });

  it("refuse le fournisseur simulé, principal ou secours", () => {
    expect(erreurs({ ...HTTP, SMS_FOURNISSEUR: "simule" }, true).join()).toContain(
      "interdit en production",
    );
    expect(erreurs({ ...HTTP, SMS_SECOURS_FOURNISSEUR: "simule" }, true).join()).toContain(
      "SMS_SECOURS_FOURNISSEUR=simule",
    );
    expect(erreurs({}, true).join()).toContain("interdit en production");
  });

  it("refuse les valeurs d'exemple, le contenu des SMS dans les journaux et l'absence de domaines", () => {
    expect(
      erreurs({ ...HTTP, SMS_API_KEY: "cle-dev-seulement-0123456789" }, true).join(),
    ).toContain("SMS_API_KEY");
    expect(erreurs({ ...HTTP, SMS_MOCK_LOG_CODES: "true" }, true).join()).toContain(
      "SMS_MOCK_LOG_CODES",
    );
    const { SMS_HOTES_LIENS: _, ...sansHotes } = HTTP;
    expect(erreurs(sansHotes, true).join()).toContain("SMS_HOTES_LIENS");
    // hors production, ces trois réglages sont permis
    expect(erreurs({ SMS_MOCK_LOG_CODES: "true" })).toEqual([]);
  });
});
