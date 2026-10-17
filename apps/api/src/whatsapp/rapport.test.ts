import { patron } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  CORPS_RAPPORT_SOIR,
  LONGUEUR_CORPS_MAX,
  LONGUEUR_SECOURS_MAX,
  erreursRapport,
  formaterRapport,
  grouper,
  montant,
  montantCourt,
  nettoyer,
  pourcentSigne,
  remplirCorps,
  type RapportSoirEntree,
} from "./rapport";
import { rapportMaquette } from "./testing/montage";

const F = " "; // espace fine insécable, séparateur de milliers

describe("formats", () => {
  it("groupe les milliers avec une espace fine insécable", () => {
    expect(grouper(1004)).toBe(`1${F}004`);
    expect(grouper(999)).toBe("999");
    expect(grouper(1_234_567)).toBe(`1${F}234${F}567`);
    expect(grouper(20000, " ")).toBe("20 000");
  });

  it("écrit un montant en F, avec le vrai signe moins et le plus demandé", () => {
    expect(montant(-1000, { signe: true })).toBe(`−1${F}000 F`);
    expect(montant(500, { signe: true })).toBe("+500 F");
    expect(montant(0, { signe: true })).toBe("0 F");
    expect(montant(500)).toBe("500 F");
    expect(montant(-1000, { ascii: true })).toBe("-1 000 F");
  });

  it("écrit un montant en millions comme la maquette (« 4,41 M », « 2,9 », « 1,5 »)", () => {
    expect(montantCourt(4_410_000)).toBe("4,41 M F");
    expect(montantCourt(2_900_000)).toBe("2,9 M F");
    expect(montantCourt(1_500_000)).toBe("1,5 M F");
    expect(montantCourt(3_000_000)).toBe("3 M F");
    expect(montantCourt(850_000)).toBe(`850${F}000 F`);
    expect(montantCourt(-2_500_000)).toBe("−2,5 M F");
  });

  it("écrit la variation en pourcentage signé", () => {
    expect(pourcentSigne(6)).toBe("+6 %");
    expect(pourcentSigne(6.4)).toBe("+6 %");
    expect(pourcentSigne(-3)).toBe("−3 %");
    expect(pourcentSigne(0)).toBe("0 %");
  });

  it("nettoie un texte pour une variable : une ligne, pas de suite d'espaces", () => {
    expect(nettoyer("  deux\nlignes\t\tici   là  ")).toBe("deux lignes ici là");
  });
});

describe("rapport du soir : variables du gabarit", () => {
  const f = formaterRapport("Alpha Voyages", rapportMaquette());

  it("reprend mot pour mot les 15 variables de la maquette", () => {
    expect(f.parametres).toEqual([
      "Alpha Voyages",
      "Rapport du mardi 5 janvier · 3 gares",
      `1${F}004`,
      "+6 % vs hier",
      "312",
      "0 litige",
      "4,41 M F",
      "2,9 M F",
      "1,5 M F",
      `Akwa · 491 billets · écart −1${F}000 F · 3 guichets clôturés · guichet 2, validé par Essono ; ` +
        "Mvan · 338 billets · écart 0 F · 1 départ fusionné (16:00 + 16:30) ; " +
        "Bafoussam · 175 billets · écart 0 F · soute pleine à 10:00",
      "23 billets vendus par les convoyeurs, tous enregistrés · 1 contrôle : 1 régularisation à Edéa",
      "84 % moyen · le 09:30 Oméga part à 55 %",
      `5 (20${F}000 F), toutes avec PIN`,
      "61 billets (6 %)",
      "Essono (Akwa), Tchinda (Mvan), Fosso (Baf.)",
    ]);
    expect(f.bouton).toBe("2027-01-05");
  });

  it("le gabarit a autant de variables que le formatage en fournit, sans trou", () => {
    const numeros = [...CORPS_RAPPORT_SOIR.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    expect(numeros).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(f.parametres).toHaveLength(15);
    expect(f.parametres.every((p) => p !== "" && !/[\n\t]| {2,}/.test(p))).toBe(true);
  });

  it("le texte rempli est celui de la planche, ligne à ligne", () => {
    const texte = remplirCorps(CORPS_RAPPORT_SOIR, f.parametres);
    expect(texte.split("\n")).toEqual([
      "AfriMove · Alpha Voyages",
      "Rapport du mardi 5 janvier · 3 gares",
      "",
      `Billets : 1${F}004 (+6 % vs hier)`,
      "Colis : 312 (0 litige)",
      "Recette : 4,41 M F (cash 2,9 M F · MoMo 1,5 M F)",
      "",
      f.parametres[9] ? `Gares : ${f.parametres[9]}` : "",
      "En route : 23 billets vendus par les convoyeurs, tous enregistrés · 1 contrôle : 1 régularisation à Edéa",
      "Remplissage : 84 % moyen · le 09:30 Oméga part à 55 %",
      `Annulations : 5 (20${F}000 F), toutes avec PIN`,
      "En ligne : 61 billets (6 %)",
      "",
      "Signé : Essono (Akwa), Tchinda (Mvan), Fosso (Baf.)",
      "Le détail complet est dans l'app AfriMove.",
    ]);
    expect(texte.length).toBeLessThanOrEqual(LONGUEUR_CORPS_MAX);
  });

  it("le corps ne commence ni ne finit par une variable (règle des gabarits WhatsApp)", () => {
    expect(CORPS_RAPPORT_SOIR).not.toMatch(/^\{\{/);
    expect(CORPS_RAPPORT_SOIR).not.toMatch(/\}\}$/);
  });

  it("gère les pluriels, l'absence d'annulation, de signature et de remarque", () => {
    const r = rapportMaquette();
    r.chiffres.litiges = 2;
    r.annulations = { nombre: 0, montant: 0, toutesAvecPin: true };
    r.signatures = [];
    r.remplissage.remarque = null;
    r.enLigne = { billets: 1, partPct: 0.4 };
    const p = formaterRapport("Alpha Voyages", r).parametres;
    expect(p[5]).toBe("2 litiges");
    expect(p[12]).toBe("aucune");
    expect(p[14]).toBe("aucune signature");
    expect(p[11]).toBe("84 % moyen");
    expect(p[13]).toBe("1 billet (0 %)");
  });

  it("dit quand une annulation s'est faite sans PIN", () => {
    const r = rapportMaquette();
    r.annulations.toutesAvecPin = false;
    expect(formaterRapport("Alpha", r).parametres[12]).toBe(
      `5 (20${F}000 F), dont au moins une sans PIN`,
    );
  });

  it("ramène à une ligne les textes libres des autres modules (remarques, en route)", () => {
    const r = rapportMaquette();
    r.gares[0]!.remarques = ["ligne un\nligne deux", "\t"];
    r.enRoute.texte = "a\n\nb";
    const p = formaterRapport("Alpha", r).parametres;
    expect(p[9]).toContain("Akwa · 491 billets · écart");
    expect(p[9]).toContain("ligne un ligne deux");
    expect(p[10]).toBe("a b");
    expect(p.every((v) => !/[\n\t]/.test(v))).toBe(true);
  });
});

describe("rapport du soir : limite de longueur de WhatsApp", () => {
  function grosRapport(nbGares: number, remarque: string): RapportSoirEntree {
    const r = rapportMaquette();
    r.gares = Array.from({ length: nbGares }, (_, i) => ({
      nom: `Gare numéro ${i + 1}`,
      billets: 100 + i,
      ecart: i % 2 === 0 ? 0 : -500,
      remarques: [remarque],
    }));
    return r;
  }

  it("retire d'abord les remarques des gares quand le rapport est trop long", () => {
    const f = formaterRapport("Alpha", grosRapport(8, "r".repeat(115)));
    const texte = remplirCorps(CORPS_RAPPORT_SOIR, f.parametres);
    expect(texte.length).toBeLessThanOrEqual(LONGUEUR_CORPS_MAX);
    expect(f.parametres[9]).not.toContain("rrrr");
    expect(f.parametres[9]).toContain("Gare numéro 8 · 107 billets");
  });

  it("retire ensuite les dernières gares : « + N autres gares »", () => {
    const f = formaterRapport("Alpha", grosRapport(40, "x"));
    const texte = remplirCorps(CORPS_RAPPORT_SOIR, f.parametres);
    expect(texte.length).toBeLessThanOrEqual(LONGUEUR_CORPS_MAX);
    expect(f.parametres[9]).toMatch(/ ; \+ \d+ autres gares$/);
    expect(f.parametres[9]).toContain("Gare numéro 1 ·");
    expect(f.parametres[9]).not.toContain("Gare numéro 40");
  });

  it("n'abrège rien quand tout tient", () => {
    const f = formaterRapport("Alpha", rapportMaquette());
    expect(f.parametres[9]).toContain("soute pleine à 10:00");
    expect(f.parametres[9]).not.toContain("autres gares");
  });
});

describe("rapport du soir : SMS de repli", () => {
  it("résume l'essentiel en moins de 300 caractères, sans caractère hors GSM courant", () => {
    const { texteSecours } = formaterRapport("Alpha Voyages", rapportMaquette());
    expect(texteSecours).toBe(
      "AfriMove Alpha Voyages : Rapport du mardi 5 janvier, 3 gares. Billets 1 004 (+6 %), colis 312, " +
        "recette 4,41 M F. Ecarts : Akwa -1 000 F. Detail dans l'app AfriMove.",
    );
    expect(texteSecours.length).toBeLessThanOrEqual(LONGUEUR_SECOURS_MAX);
    expect(texteSecours).not.toMatch(/[ −·→]/);
    expect(texteSecours).not.toMatch(/:\/\/|www\./);
  });

  it("dit qu'il n'y a aucun écart, et abrège une longue liste d'écarts", () => {
    const sans = rapportMaquette();
    sans.gares.forEach((g) => (g.ecart = 0));
    expect(formaterRapport("Alpha", sans).texteSecours).toContain("Aucun ecart de caisse.");

    const beaucoup = rapportMaquette();
    beaucoup.gares = Array.from({ length: 30 }, (_, i) => ({
      nom: `Gare ${i + 1}`,
      billets: 1,
      ecart: -100 * (i + 1),
      remarques: [],
    }));
    const t = formaterRapport("Alpha", beaucoup).texteSecours;
    expect(t.length).toBeLessThanOrEqual(LONGUEUR_SECOURS_MAX);
    expect(t).toContain("Gare 1 -100 F");
    expect(t).toMatch(/\.\.\. Detail dans l'app AfriMove\.$/);
  });
});

describe("validation du rapport", () => {
  it("accepte le rapport de la maquette", () => {
    expect(erreursRapport(rapportMaquette())).toEqual([]);
  });

  it("refuse un rapport mal formé, en nommant les champs", () => {
    const r = rapportMaquette() as unknown as Record<string, unknown>;
    r["jour"] = "5 janvier";
    r["chiffres"] = { billets: -1, variationBilletsPct: "x" };
    r["gares"] = [{ nom: "", billets: 1.5, ecart: 0, remarques: [3] }];
    r["signatures"] = "Essono";
    const erreurs = erreursRapport(r);
    expect(erreurs).toEqual(
      expect.arrayContaining([
        "jour : AAAA-MM-JJ attendu",
        "chiffres.billets : entier positif attendu",
        "chiffres.variationBilletsPct : nombre attendu",
        "chiffres.recette : entier attendu",
        "gares[0].nom : texte de 40 caractères au plus",
        "gares[0].billets : entier positif attendu",
        "gares[0].remarques : liste de 10 textes au plus",
        "signatures : liste de 20 signatures au plus",
      ]),
    );
    expect(erreursRapport(null)).toEqual(["rapport : objet attendu"]);
  });
});

describe("parité avec le contrat RapportSoir (packages/contrats)", () => {
  /** Un RapportSoir complet du contrat, avec les chiffres de la maquette. */
  const contrat = {
    ...rapportMaquette(),
    envoyeA: "2027-01-05T21:00:00.000+01:00",
    nbGares: 3,
    gares: rapportMaquette().gares.map((g, i) => ({ ...g, gareId: `gare-${i}` })),
    enRoute: {
      billetsConvoyeurs: 23,
      controles: 1,
      regularisations: 1,
      texte: rapportMaquette().enRoute.texte,
    },
    questionSuggeree: {
      question: "Pourquoi le 09:30 Oméga part si vide ?",
      reponse: "Trois jours à 55 %.",
    },
  };

  it("un rapport valide du contrat se met en forme sans conversion", () => {
    const valide: patron.RapportSoir = patron.RapportSoirSchema.parse(contrat);
    const entree: RapportSoirEntree = valide; // échoue à la compilation si les formes divergent
    expect(erreursRapport(entree)).toEqual([]);
    expect(formaterRapport("Alpha Voyages", entree).parametres).toEqual(
      formaterRapport("Alpha Voyages", rapportMaquette()).parametres,
    );
  });
});
