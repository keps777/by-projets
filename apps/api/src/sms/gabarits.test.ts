import { describe, expect, it } from "vitest";
import {
  GABARITS,
  SEGMENTS_MAX,
  VariablesInvalides,
  heureDouala,
  jourHeureDouala,
  rendreSms,
} from "./gabarits";
import { TYPES_SMS } from "./types";

const DEPART = new Date("2027-01-05T07:30:00.000Z"); // 08h30 à Douala

const BILLET = {
  compagnie: "Alpha Voyages",
  origine: "Douala",
  destination: "Yaoundé",
  departA: DEPART,
  siege: "14",
  code: "7341",
  lien: "https://afrimove.app/b/Xk3pQ9",
};
const RETRAIT = {
  compagnie: "Bêta Express",
  numeroColis: "COL-0042",
  lieu: "gare de Bafoussam",
  code: "483920",
};
const PROCHE = {
  voyageur: "Aïcha",
  gare: "Mvan",
  arriveeA: new Date("2027-01-05T09:40:00.000Z"),
  compagnie: "Alpha Voyages",
};
const RETARD = {
  compagnie: "Alpha Voyages",
  origine: "Douala",
  destination: "Yaoundé",
  departA: DEPART,
  minutes: 20,
};
const PIN = { pin: "482915", lien: "https://afrimove.app/app" };

describe("rendu des gabarits", () => {
  it("billet : trajet, heure de Douala, siège, code à 4 chiffres et lien", () => {
    const r = rendreSms("billet", BILLET);
    expect(r.texte).toBe(
      "Alpha Voyages : billet Douala > Yaoundé, 05/01 à 08h30, siège 14. Code 7341. Billet et QR : https://afrimove.app/b/Xk3pQ9",
    );
    expect(r).toMatchObject({ encodage: "gsm7", segments: 1, sensible: true, validiteMs: null });
  });

  it("code de retrait : le code à 6 chiffres, le lieu, la consigne de discrétion", () => {
    const r = rendreSms("code_retrait", RETRAIT);
    expect(r.texte).toBe(
      "Bêta Express : colis COL-0042 à retirer à gare de Bafoussam. Code de retrait : 483920. Ne le donnez qu'à la remise du colis.".replace(
        "Bêta",
        "Beta",
      ),
    );
    expect(r.sensible).toBe(true);
  });

  it("alerte au proche : heure d'arrivée de Douala, sans accent hors GSM", () => {
    const r = rendreSms("alerte_proche", PROCHE);
    expect(r.texte).toBe("AfriMove : Aicha arrive à Mvan vers 10h40 (bus Alpha Voyages).");
    expect(r.sensible).toBe(false);
  });

  it("retard : minutes, avec ou sans heure d'arrivée", () => {
    expect(rendreSms("retard", RETARD).texte).toBe(
      "Alpha Voyages : le bus Douala > Yaoundé de 08h30 aura 20 min de retard.",
    );
    expect(
      rendreSms("retard", { ...RETARD, arriveeA: new Date("2027-01-05T10:15:00.000Z") }).texte,
    ).toBe(
      "Alpha Voyages : le bus Douala > Yaoundé de 08h30 aura 20 min de retard. Arrivée vers 11h15.",
    );
  });

  it("PIN provisoire : valable 1 h, à changer à la première connexion", () => {
    const r = rendreSms("pin_provisoire", PIN);
    expect(r.texte).toBe(
      "AfriMove : votre PIN provisoire est 482915. Valable 1 h. Changez-le à votre première connexion : https://afrimove.app/app",
    );
    expect(r.validiteMs).toBe(3_600_000);
    expect(r.sensible).toBe(true);
  });

  it("système : texte libre, valable 5 minutes (codes de connexion)", () => {
    const r = rendreSms("systeme", { texte: "Votre code AfriMove est 123456" });
    expect(r.texte).toBe("Votre code AfriMove est 123456");
    expect(r.validiteMs).toBe(300_000);
  });

  it("chaque type a un gabarit, et chaque exemple tient en 2 SMS GSM au plus", () => {
    expect(Object.keys(GABARITS).sort()).toEqual([...TYPES_SMS].sort());
    const exemples = {
      billet: BILLET,
      code_retrait: RETRAIT,
      alerte_proche: PROCHE,
      retard: RETARD,
      pin_provisoire: PIN,
      systeme: { texte: "x" },
    } as const;
    for (const type of TYPES_SMS) {
      const r = rendreSms(type, exemples[type]);
      expect(r.encodage, type).toBe("gsm7");
      expect(r.segments, type).toBeLessThanOrEqual(2);
    }
  });

  it("l'heure est celle de Douala (UTC+1), y compris au passage de minuit", () => {
    expect(heureDouala(new Date("2027-01-05T07:30:00Z"))).toBe("08h30");
    expect(jourHeureDouala(new Date("2027-01-05T23:05:00Z"))).toBe("06/01 à 00h05");
    expect(jourHeureDouala(new Date("2026-12-31T23:30:00Z"))).toBe("01/01 à 00h30");
  });
});

describe("validation des variables", () => {
  const erreurs = (type: Parameters<typeof rendreSms>[0], v: unknown): readonly string[] => {
    try {
      rendreSms(type, v);
    } catch (e) {
      if (e instanceof VariablesInvalides) return e.erreurs;
      throw e;
    }
    return [];
  };

  it("signale tous les champs manquants d'un coup", () => {
    expect(erreurs("billet", {})).toHaveLength(7);
  });

  it.each([
    ["code", "73411"],
    ["code", "abcd"],
    ["code", 7341],
    ["lien", "http://afrimove.app/b/1"],
    ["lien", "https://afrimove.app/b/ 1"],
    ["lien", "javascript:alert(1)"],
    ["lien", `https://afrimove.app/${"a".repeat(80)}`],
    ["departA", "2027-01-05T08:30:00"], // sans fuseau : ambigu
    ["departA", "demain"],
    ["siege", "1234567"],
    ["compagnie", ""],
    ["compagnie", "Alpha http://pirate.example/x"],
    ["compagnie", "Alpha www.pirate.example"],
  ])("refuse %s = %j", (champ, valeur) => {
    expect(erreurs("billet", { ...BILLET, [champ]: valeur }).join()).toContain(champ);
  });

  it("accepte une date ISO avec fuseau envoyée en texte", () => {
    const r = rendreSms("billet", { ...BILLET, departA: "2027-01-05T08:30:00+01:00" });
    expect(r.texte).toContain("05/01 à 08h30");
  });

  it("le code de retrait a 6 chiffres, le PIN aussi", () => {
    expect(erreurs("code_retrait", { ...RETRAIT, code: "4839" })).not.toHaveLength(0);
    expect(erreurs("pin_provisoire", { ...PIN, pin: "4829" })).not.toHaveLength(0);
  });

  it("les minutes de retard sont un entier entre 1 et 720", () => {
    for (const minutes of [0, -5, 721, 12.5, "20"]) {
      expect(erreurs("retard", { ...RETARD, minutes }).join()).toContain("minutes");
    }
  });

  it("ramène les sauts de ligne et espaces multiples à un espace (pas de message trompeur)", () => {
    const r = rendreSms("billet", { ...BILLET, compagnie: "Alpha\n\nVoyages\t  Plus\r\n" });
    expect(r.texte.startsWith("Alpha Voyages Plus : billet")).toBe(true);
    expect(r.texte).not.toMatch(/[\r\n\t]/);
  });

  it("refuse des variables qui ne forment pas un objet", () => {
    for (const v of [null, "texte", 12, []]) expect(erreurs("billet", v)).not.toHaveLength(0);
  });

  it(`refuse un message de plus de ${SEGMENTS_MAX} SMS`, () => {
    const e = erreurs("systeme", { texte: "a".repeat(320) });
    expect(e).toEqual([]); // 320 caractères = 3 morceaux GSM : accepté
    const long = {
      ...BILLET,
      compagnie: "a".repeat(30),
      origine: "b".repeat(24),
      destination: "c".repeat(24),
      lien: `https://afrimove.app/${"d".repeat(58)}`,
    };
    expect(erreurs("billet", long)).toEqual([]);
    // 4 morceaux : impossible avec les plafonds de champ, on vérifie donc le garde-fou à part
    expect(() => rendreSms("systeme", { texte: "€".repeat(320) })).toThrow(VariablesInvalides);
  });
});
