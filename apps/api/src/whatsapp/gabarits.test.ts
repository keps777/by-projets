import { describe, expect, it } from "vitest";
import {
  BASE_LIEN_BILLET,
  GABARITS,
  TYPES_GABARIT,
  VariablesInvalides,
  nombreVariables,
  rendreWhatsApp,
} from "./gabarits";
import { VARIABLES_BILLET, VARIABLES_COLIS, rapportMaquette } from "./testing/montage";

const ALERTE_PROCHE = {
  voyageur: "Marie",
  gare: "Yaoundé",
  arriveeA: new Date("2027-01-05T10:40:00.000Z"),
  compagnie: "Alpha Voyages",
};
const ALERTE_RETARD = {
  compagnie: "Alpha Voyages",
  origine: "Douala",
  destination: "Yaoundé",
  departA: new Date("2027-01-05T07:30:00.000Z"),
  minutes: 45,
  arriveeA: new Date("2027-01-05T11:40:00.000Z"),
};
const VARIABLES = {
  rapport_soir: { compagnie: "Alpha Voyages", rapport: rapportMaquette() },
  billet: VARIABLES_BILLET,
  colis: VARIABLES_COLIS,
  alerte_proche: ALERTE_PROCHE,
  alerte_retard: ALERTE_RETARD,
} as const;

describe("règles des gabarits WhatsApp", () => {
  it.each(TYPES_GABARIT)("%s : variables numérotées de 1 à n, sans trou", (type) => {
    const numeros = [...GABARITS[type].corps.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    const distincts = [...new Set(numeros)].sort((a, b) => a - b);
    expect(distincts).toEqual(Array.from({ length: distincts.length }, (_, i) => i + 1));
  });

  it.each(TYPES_GABARIT)("%s : le corps ne commence ni ne finit par une variable", (type) => {
    const { corps } = GABARITS[type];
    expect(corps).not.toMatch(/^\{\{/);
    expect(corps).not.toMatch(/\}\}\s*$/);
    expect(corps).not.toMatch(/\}\}\{\{/);
  });

  it.each(TYPES_GABARIT)(
    "%s : le rendu fournit exactement une valeur non vide par variable, sur une seule ligne",
    (type) => {
      const rendu = rendreWhatsApp(type, VARIABLES[type]);
      expect(rendu.parametres).toHaveLength(nombreVariables(GABARITS[type].corps));
      for (const p of rendu.parametres) {
        expect(p).not.toBe("");
        expect(p).not.toMatch(/[\n\t]| {2,}/);
      }
      expect(rendu.texte).not.toMatch(/\{\{/);
      expect(rendu.texte.length).toBeLessThanOrEqual(1024);
    },
  );

  it("les noms de gabarit sont distincts et acceptés par WhatsApp (minuscules, chiffres, _)", () => {
    const noms = TYPES_GABARIT.map((t) => GABARITS[t].nom);
    expect(new Set(noms).size).toBe(noms.length);
    for (const n of noms) expect(n).toMatch(/^afrimove_[a-z0-9_]{1,50}$/);
  });

  it("seuls le rapport et le billet ont un bouton, avec l'adresse approuvée", () => {
    expect(GABARITS.rapport_soir.bouton).toEqual({
      libelle: "Ouvrir le détail dans l'app",
      urlModele: "https://afrimove.app/patron/rapport?jour={{1}}",
    });
    expect(GABARITS.billet.bouton?.urlModele).toBe(`${BASE_LIEN_BILLET}{{1}}`);
    expect(GABARITS.colis.bouton).toBeNull();
    expect(GABARITS.alerte_proche.bouton).toBeNull();
    expect(GABARITS.alerte_retard.bouton).toBeNull();
  });
});

describe("textes rendus", () => {
  it("billet : texte, bouton (identifiant du lien) et repli SMS", () => {
    const r = rendreWhatsApp("billet", VARIABLES_BILLET);
    expect(r.texte).toBe(
      "Votre billet Alpha Voyages : Douala → Yaoundé, départ le 05/01 à 08h30, siège 14.\n" +
        "Code d'embarquement : 7341\n" +
        "Présentez le QR du billet à la montée.",
    );
    expect(r.boutonUrl).toBe("Xk3pQ9");
    expect(r.texteSecours).toContain("Code 7341. Billet et QR : https://afrimove.app/b/Xk3pQ9");
    expect(r.variablesSecours).toMatchObject({ code: "7341", siege: "14" });
    expect(r.sensible).toBe(true);
  });

  it("colis : numéro, compagnie, lieu et code de retrait", () => {
    const r = rendreWhatsApp("colis", VARIABLES_COLIS);
    expect(r.texte).toBe(
      "Colis COL-4821 de Alpha Voyages : à retirer à gare de Yaoundé.\n" +
        "Code de retrait : 482915\n" +
        "Ne le donnez qu'à la remise du colis.",
    );
    expect(r.boutonUrl).toBeNull();
    expect(r.sensible).toBe(true);
  });

  it("alerte au proche : heure de Douala, valable 3 h", () => {
    const r = rendreWhatsApp("alerte_proche", ALERTE_PROCHE);
    expect(r.texte).toBe(
      "AfriMove : Marie arrive à Yaoundé vers 11h40 (bus Alpha Voyages).\nMessage automatique.",
    );
    expect(r.validiteMs).toBe(3 * 60 * 60_000);
    expect(r.sensible).toBe(false);
  });

  it("retard : avec et sans heure d'arrivée (la variable n'est jamais vide)", () => {
    const avec = rendreWhatsApp("alerte_retard", ALERTE_RETARD);
    expect(avec.texte).toBe(
      "Retard : le bus Alpha Voyages Douala → Yaoundé de 08h30 aura 45 min de retard. Arrivée vers 12h40.\n" +
        "Merci de votre patience.",
    );
    const sans = rendreWhatsApp("alerte_retard", { ...ALERTE_RETARD, arriveeA: null });
    expect(sans.texte).toContain("aura 45 min de retard. L'heure d'arrivée vous sera communiquée.");
    expect(sans.texteSecours).toBe(
      "Alpha Voyages : le bus Douala > Yaoundé de 08h30 aura 45 min de retard.",
    );
  });

  it("rapport : pas de variables de repli (pas de gabarit SMS), texte de repli prêt", () => {
    const r = rendreWhatsApp("rapport_soir", VARIABLES.rapport_soir);
    expect(r.variablesSecours).toBeNull();
    expect(r.texteSecours).toMatch(/^AfriMove Alpha Voyages : Rapport du mardi 5 janvier/);
    expect(r.boutonUrl).toBe("2027-01-05");
  });
});

describe("validation des variables", () => {
  const erreurs = (
    type: Parameters<typeof rendreWhatsApp>[0],
    brut: unknown,
  ): readonly string[] => {
    try {
      rendreWhatsApp(type, brut);
    } catch (e) {
      if (e instanceof VariablesInvalides) return e.erreurs;
      throw e;
    }
    return [];
  };

  it("refuse un code qui n'est pas à 4 (billet) ou 6 chiffres (colis)", () => {
    expect(erreurs("billet", { ...VARIABLES_BILLET, code: "73412" })).toContain(
      "code : 4 chiffres",
    );
    expect(erreurs("colis", { ...VARIABLES_COLIS, code: "4829" })).toContain("code : 6 chiffres");
  });

  it("n'accepte comme lien de billet que l'adresse approuvée dans le gabarit", () => {
    for (const lien of [
      "https://autre.example/b/Xk3pQ9",
      "http://afrimove.app/b/Xk3pQ9",
      "https://afrimove.app/b/",
      "https://afrimove.app/b/Xk3pQ9?x=1",
      "https://afrimove.app.evil.example/b/Xk3pQ9",
      "https://afrimove.app/x/Xk3pQ9",
    ]) {
      expect(erreurs("billet", { ...VARIABLES_BILLET, lien }), lien).toEqual([
        `lien : ${BASE_LIEN_BILLET}<identifiant du billet>`,
      ]);
    }
  });

  it("refuse une adresse web dans un nom, et un texte vide ou trop long", () => {
    expect(
      erreurs("billet", { ...VARIABLES_BILLET, compagnie: "Alpha https://x.example" }),
    ).toEqual(["compagnie ne peut pas contenir d'adresse"]);
    expect(erreurs("billet", { ...VARIABLES_BILLET, origine: "   " })).toEqual([
      "origine est obligatoire",
    ]);
    expect(erreurs("billet", { ...VARIABLES_BILLET, siege: "1234567" })).toEqual([
      "siege : 6 caractères au plus",
    ]);
  });

  it("refuse une date sans fuseau (ambiguë) et accepte une chaîne ISO avec décalage", () => {
    expect(erreurs("billet", { ...VARIABLES_BILLET, departA: "2027-01-05T08:30:00" })[0]).toMatch(
      /^departA : date ISO avec fuseau/,
    );
    const r = rendreWhatsApp("billet", {
      ...VARIABLES_BILLET,
      departA: "2027-01-05T08:30:00+01:00",
    });
    expect(r.texte).toContain("départ le 05/01 à 08h30");
  });

  it("refuse des minutes de retard hors de 1 à 720", () => {
    expect(erreurs("alerte_retard", { ...ALERTE_RETARD, minutes: 0 })).toEqual([
      "minutes : entier entre 1 et 720",
    ]);
    expect(erreurs("alerte_retard", { ...ALERTE_RETARD, minutes: 12.5 })).toHaveLength(1);
  });

  it("refuse des variables qui ne forment pas un objet, et un rapport mal formé", () => {
    expect(erreurs("billet", null)).toEqual(["les variables doivent former un objet"]);
    expect(erreurs("colis", [])).toEqual(["les variables doivent former un objet"]);
    const mauvais = erreurs("rapport_soir", { compagnie: "Alpha", rapport: { jour: "demain" } });
    expect(mauvais).toContain("jour : AAAA-MM-JJ attendu");
    expect(erreurs("rapport_soir", { rapport: rapportMaquette() })).toEqual([
      "compagnie est obligatoire",
    ]);
  });

  it("ne met aucune valeur du message dans le texte de l'erreur", () => {
    try {
      rendreWhatsApp("colis", { ...VARIABLES_COLIS, code: "secret" });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain("secret");
    }
  });
});
