import { describe, expect, it } from "vitest";
import {
  ConnecteurMtn,
  ConnecteurOrange,
  RequeteUssdIllisible,
  msisdnInternational,
} from "./connecteurs";

const mtn = new ConnecteurMtn();
const orange = new ConnecteurOrange();

describe("numéros", () => {
  it("accepte le numéro avec ou sans « + », avec ou sans indicatif", () => {
    expect(msisdnInternational("237677012345")).toBe("+237677012345");
    expect(msisdnInternational("+237 677 01 23 45")).toBe("+237677012345");
    expect(msisdnInternational("677012345")).toBe("+237677012345");
  });

  it("refuse ce qui n'est pas un mobile camerounais", () => {
    for (const mauvais of ["", "abc", "33612345678", "+33612345678", "237222123456", "12345"]) {
      expect(() => msisdnInternational(mauvais), mauvais).toThrow(RequeteUssdIllisible);
    }
  });
});

describe("connecteur MTN", () => {
  const base = { sessionId: "ATUid_1", msisdn: "237677012345", serviceCode: "*123#" };

  it("ouverture : texte vide", () => {
    expect(mtn.lire({ ...base, text: "" })).toEqual({
      operateur: "mtn",
      sessionId: "ATUid_1",
      msisdn: "+237677012345",
      saisie: "",
      nouvelle: true,
      fermeture: false,
    });
  });

  it("réponse : la dernière du texte cumulé", () => {
    expect(mtn.lire({ ...base, text: "1*2*1" })).toMatchObject({ saisie: "1", nouvelle: false });
    expect(mtn.lire({ ...base, text: "5*677012345" })).toMatchObject({ saisie: "677012345" });
    expect(mtn.lire({ ...base, text: "1" })).toMatchObject({ saisie: "1", nouvelle: false });
  });

  it("accepte aussi phoneNumber, un texte numérique et des caractères parasites", () => {
    expect(mtn.lire({ sessionId: "s", phoneNumber: "677012345", text: 2 })).toMatchObject({
      saisie: "2",
      nouvelle: false,
      msisdn: "+237677012345",
    });
    expect(mtn.lire({ ...base, text: "1*2\u0000<b>" })).toMatchObject({ saisie: "2b" });
  });

  it("répond CON pour continuer, END pour terminer", () => {
    expect(mtn.ecrire({ texte: "AfriMove\n1 Billet", fin: false })).toEqual({
      contentType: "text/plain; charset=utf-8",
      corps: "CON AfriMove\n1 Billet",
    });
    expect(mtn.ecrire({ texte: "Annule.", fin: true }).corps).toBe("END Annule.");
  });

  it("refuse une requête incomplète ou mal formée", () => {
    expect(() => mtn.lire(null)).toThrow(RequeteUssdIllisible);
    expect(() => mtn.lire([])).toThrow(RequeteUssdIllisible);
    expect(() => mtn.lire({ msisdn: "237677012345", text: "" })).toThrow(/sessionId/);
    expect(() => mtn.lire({ sessionId: "s", text: "" })).toThrow(/msisdn/);
    expect(() => mtn.lire({ ...base, sessionId: "a b/c" })).toThrow(/session/);
    expect(() => mtn.lire({ ...base, sessionId: "x".repeat(65) })).toThrow(/trop long/);
    expect(() => mtn.lire({ ...base, text: { a: 1 } })).toThrow(/texte/);
    expect(() => mtn.lire({ ...base, text: "1*".repeat(101) })).toThrow(/trop long/);
  });
});

describe("connecteur Orange", () => {
  const base = { session_id: "or-77", msisdn: "+237691221008" };

  it("begin, continue et end", () => {
    expect(orange.lire({ ...base, request_type: "begin" })).toEqual({
      operateur: "orange",
      sessionId: "or-77",
      msisdn: "+237691221008",
      saisie: "",
      nouvelle: true,
      fermeture: false,
    });
    expect(orange.lire({ ...base, request_type: "continue", input: "2" })).toMatchObject({
      saisie: "2",
      nouvelle: false,
      fermeture: false,
    });
    expect(orange.lire({ ...base, request_type: "END" })).toMatchObject({
      nouvelle: false,
      fermeture: true,
    });
  });

  it("répond en JSON { message, action }", () => {
    expect(JSON.parse(orange.ecrire({ texte: "Annule.", fin: true }).corps)).toEqual({
      message: "Annule.",
      action: "end",
    });
    const suite = orange.ecrire({ texte: "1 Billet", fin: false });
    expect(suite.contentType).toContain("application/json");
    expect(JSON.parse(suite.corps)).toEqual({ message: "1 Billet", action: "continue" });
  });

  it("refuse un type de requête inconnu ou absent", () => {
    expect(() => orange.lire({ ...base, request_type: "ping" })).toThrow(/begin, continue ou end/);
    expect(() => orange.lire(base)).toThrow(/request_type/);
  });
});
