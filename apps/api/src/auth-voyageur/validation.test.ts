import { voyageur } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { chargerConfigAuthVoyageur } from "./config";
import { ConfigAuthVoyageurInvalide } from "./erreurs";
import { lireDemandeCode, lireVerification } from "./validation";

/**
 * Les lecteurs de l'API sont le miroir des schémas zod du contrat : mêmes valeurs acceptées, mêmes
 * valeurs refusées. Si le contrat change, ce test le dit.
 */

const demandes: unknown[] = [
  { telephone: "+237691221008" },
  { telephone: "+237691221008", canal: "sms" },
  { telephone: "+237691221008", canal: "whatsapp" },
  { telephone: "+237691221008", canal: "ussd" },
  { telephone: "+33612345678" },
  { telephone: "+1234567" }, // 7 chiffres : trop court
  { telephone: "+123456789012345" }, // 15 chiffres
  { telephone: "+1234567890123456" }, // 16 chiffres
  { telephone: "237691221008" },
  { telephone: "691221008" },
  { telephone: "+237 691 221 008" },
  { telephone: "+237691221008", canal: "pigeon" },
  { telephone: "+237691221008", canal: 3 },
  { telephone: 237691221008 },
  { telephone: null },
  { canal: "sms" },
  {},
  [],
  null,
  "texte",
];

const verifications: unknown[] = [
  { telephone: "+237691221008", code: "4821" },
  { telephone: "+237691221008", code: "0042" },
  { telephone: "+237691221008", code: "482" },
  { telephone: "+237691221008", code: "48211" },
  { telephone: "+237691221008", code: "48a1" },
  { telephone: "+237691221008", code: " 482" },
  { telephone: "+237691221008", code: 4821 },
  { telephone: "+237691221008" },
  { code: "4821" },
  { telephone: "691221008", code: "4821" },
  {},
  null,
];

function accepte(lecteur: () => unknown): boolean {
  try {
    lecteur();
    return true;
  } catch {
    return false;
  }
}

describe("corps de la demande de code", () => {
  it.each(demandes.map((d) => [JSON.stringify(d), d] as const))(
    "même verdict que SchemaDemandeCode : %s",
    (_nom, corps) => {
      expect(accepte(() => lireDemandeCode(corps))).toBe(
        voyageur.SchemaDemandeCode.safeParse(corps).success,
      );
    },
  );

  it("rend le numéro et le canal tels que reçus", () => {
    expect(lireDemandeCode({ telephone: "+237691221008", canal: "whatsapp" })).toEqual({
      telephone: "+237691221008",
      canal: "whatsapp",
    });
    expect(lireDemandeCode({ telephone: "+237691221008" })).toEqual({ telephone: "+237691221008" });
  });
});

describe("corps de la vérification", () => {
  it.each(verifications.map((d) => [JSON.stringify(d), d] as const))(
    "même verdict que SchemaVerificationCode : %s",
    (_nom, corps) => {
      expect(accepte(() => lireVerification(corps))).toBe(
        voyageur.SchemaVerificationCode.safeParse(corps).success,
      );
    },
  );
});

describe("configuration", () => {
  it("prend les valeurs du ticket par défaut", () => {
    expect(chargerConfigAuthVoyageur({})).toMatchObject({
      ttlCodeMs: 300_000,
      intervalleEnvoiMs: 40_000,
      envoisParFenetre: 5,
      essaisMax: 5,
      blocageBaseMs: 15 * 60_000,
      domaineWebOtp: "afrimove.app",
      indicatifsAutorises: ["+237"],
      production: false,
    });
  });

  it("lit les variables AUTH_VOYAGEUR_*", () => {
    const c = chargerConfigAuthVoyageur({
      AUTH_VOYAGEUR_CODE_TTL_S: "120",
      AUTH_VOYAGEUR_RENVOI_S: "60",
      AUTH_VOYAGEUR_ENVOIS_PAR_HEURE: "3",
      AUTH_VOYAGEUR_ESSAIS_MAX: "4",
      AUTH_VOYAGEUR_BLOCAGE_MIN: "30",
      AUTH_VOYAGEUR_WEBOTP_DOMAINE: "App.Exemple.cm",
      AUTH_VOYAGEUR_INDICATIFS: "+237, +241",
    });
    expect(c).toMatchObject({
      ttlCodeMs: 120_000,
      intervalleEnvoiMs: 60_000,
      envoisParFenetre: 3,
      essaisMax: 4,
      blocageBaseMs: 30 * 60_000,
      domaineWebOtp: "app.exemple.cm",
      indicatifsAutorises: ["+237", "+241"],
    });
  });

  it("liste toutes les erreurs d'un coup", () => {
    try {
      chargerConfigAuthVoyageur({
        AUTH_VOYAGEUR_ESSAIS_MAX: "0",
        AUTH_VOYAGEUR_WEBOTP_DOMAINE: "https://afrimove.app/connexion",
        AUTH_VOYAGEUR_INDICATIFS: "237",
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigAuthVoyageurInvalide);
      expect((e as ConfigAuthVoyageurInvalide).erreurs).toHaveLength(3);
    }
  });

  it("exige le domaine WebOTP en production (le SMS doit pointer sur l'application)", () => {
    expect(() => chargerConfigAuthVoyageur({}, true)).toThrow(/AUTH_VOYAGEUR_WEBOTP_DOMAINE/);
    expect(
      chargerConfigAuthVoyageur({ AUTH_VOYAGEUR_WEBOTP_DOMAINE: "app.exemple.cm" }, true)
        .domaineWebOtp,
    ).toBe("app.exemple.cm");
  });
});
