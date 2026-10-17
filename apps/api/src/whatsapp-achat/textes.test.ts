import { describe, expect, it } from "vitest";
import { USSD } from "../../../../packages/fixtures/src/ecrans/USSD";
import { LANGUES } from "./langues";
import {
  LONGUEUR_MESSAGE_MAX,
  compagnieCourte,
  emplacementDans,
  enumerer,
  etiquetteCompagnie,
  ligneDepart,
  milliers,
  textes,
  textesInventes,
} from "./textes";

const [, LISTE, , PROPOSITION, PAYE] = USSD.donnees.whatsapp.echanges;

const LIGNES = [
  { heure: "08:00", compagnie: "Bêta Voyages", vip: true, prix: 7500 },
  { heure: "08:30", compagnie: "Alpha Voyages", vip: false, prix: 4000 },
  { heure: "09:30", compagnie: "Oméga Express", vip: false, prix: 3800 },
] as const;

describe("les trois messages de la maquette sont repris mot pour mot (français)", () => {
  it("la liste des départs", () => {
    expect(textes("fr").listeDeparts({ jour: "demain", trajet: null, lignes: LIGNES })).toBe(
      LISTE!.texte.join("\n"),
    );
  });

  it("la proposition de siège et de paiement (le siège 7 est de la maquette)", () => {
    expect(
      textes("fr").confirmation({
        compagnie: "Alpha Voyages",
        vip: false,
        heure: "08:30",
        siege: 7,
        emplacement: "fenêtre",
        prix: 4000,
      }),
    ).toBe(PROPOSITION!.texte.join("\n"));
  });

  it("le billet payé", () => {
    expect(
      textes("fr").billetPaye({ numero: "ALP-DLA-270106-0031", code: "5582", prenom: "Aïcha" }),
    ).toBe(PAYE!.texte.join("\n"));
  });
});

describe("mise en forme", () => {
  it("milliers", () => {
    expect([0, 950, 4000, 7500, 12500, 1234567].map(milliers)).toEqual([
      "0",
      "950",
      "4 000",
      "7 500",
      "12 500",
      "1 234 567",
    ]);
  });
  it("la compagnie est abrégée à son premier mot", () => {
    expect(compagnieCourte("Bêta Voyages")).toBe("Bêta");
    expect(compagnieCourte("  Alpha  ")).toBe("Alpha");
    expect(compagnieCourte("Supercalifragilisticexpialidocious")).toHaveLength(14);
    expect(etiquetteCompagnie("Bêta Voyages", true)).toBe("Bêta VIP");
    expect(etiquetteCompagnie("Alpha Voyages", false)).toBe("Alpha");
  });
  it("une ligne de départ", () => {
    expect(ligneDepart(1, LIGNES[0])).toBe("1 · 08:00 Bêta VIP 7 500");
  });
  it("énumérer les réponses possibles", () => {
    expect(enumerer(1, "ou")).toBe("1");
    expect(enumerer(2, "ou")).toBe("1 ou 2");
    expect(enumerer(3, "or")).toBe("1, 2 or 3");
    expect(enumerer(5, "ou")).toBe("1, 2, 3, 4 ou 5");
  });
  it("l'emplacement d'un siège suit la langue", () => {
    expect(emplacementDans("fenêtre · près de la porte", "fr")).toBe("fenêtre · près de la porte");
    expect(emplacementDans("fenêtre · près de la porte", "en")).toBe("window · near the door");
    expect(emplacementDans("couloir", "pcm")).toBe("aisle");
  });
});

describe("même catalogue dans les trois langues", () => {
  const fr = textes("fr");

  it.each(LANGUES)("%s : liste, singulier, trajet rappelé", (langue) => {
    const t = textes(langue);
    const liste = t
      .listeDeparts({ jour: "demain", trajet: "Douala → Yaoundé", lignes: LIGNES })
      .split("\n");
    expect(liste[0]).toBe("Douala → Yaoundé");
    expect(liste).toHaveLength(6);
    expect(liste.slice(2, 5)).toEqual([
      "1 · 08:00 Bêta VIP 7 500",
      "2 · 08:30 Alpha 4 000",
      "3 · 09:30 Oméga 3 800",
    ]);
    const un = t
      .listeDeparts({ jour: "aujourdhui", trajet: null, lignes: [LIGNES[1]] })
      .split("\n");
    expect(un).toHaveLength(3);
    expect(un[1]).toBe("1 · 08:30 Alpha 4 000");
  });

  it.each(LANGUES)("%s : le billet contient numéro et code, avec ou sans prénom", (langue) => {
    const t = textes(langue);
    const avec = t.billetPaye({ numero: "ALP-DLA-261102-0001", code: "1234", prenom: "Aïcha" });
    const sans = t.billetPaye({ numero: "ALP-DLA-261102-0001", code: "1234", prenom: null });
    for (const m of [avec, sans]) {
      expect(m).toContain("ALP-DLA-261102-0001");
      expect(m).toContain("1234");
      expect(m.startsWith("✓")).toBe(true);
    }
    expect(avec).toContain("Aïcha");
    expect(sans).not.toContain(", .");
    expect(sans.endsWith(".")).toBe(true);
    expect(sans).not.toContain("Aïcha");
  });

  it.each(LANGUES)(
    "%s : la proposition dit la compagnie, l'heure, le siège et le prix",
    (langue) => {
      const m = textes(langue).confirmation({
        compagnie: "Bêta Voyages",
        vip: true,
        heure: "08:00",
        siege: 12,
        emplacement: "couloir",
        prix: 7500,
      });
      const [premiere, seconde] = m.split("\n");
      expect(premiere).toContain("Bêta VIP 08:00");
      expect(premiere).toContain("12");
      expect(premiere).toContain("7 500 F");
      expect(seconde).toMatch(/^(Oui|Yes) · Change/);
    },
  );

  it.each(LANGUES)("%s : les sièges libres sont listés un par ligne", (langue) => {
    const m = textes(langue).siegesLibres([
      { numero: 1, emplacement: "fenêtre · près de la porte" },
      { numero: 6, emplacement: "couloir" },
    ]);
    const lignes = m.split("\n");
    expect(lignes).toHaveLength(4);
    expect(lignes[1]).toMatch(/^1 · /);
    expect(lignes[2]).toMatch(/^6 · /);
  });

  it.each(LANGUES)("%s : aucun message ne dépasse la longueur d'un message WhatsApp", (langue) => {
    const t = textes(langue);
    const tous = [
      t.aide,
      t.salutation,
      t.aucunDepart({ trajet: "Douala → Yaoundé", jour: null, periode: null, apres: "08:00" }),
      t.villeInconnue("Garoua", [
        "Douala",
        "Yaoundé",
        "Bafoussam",
        "Bamenda",
        "Kribi",
        "Ngaoundéré",
      ]),
      t.compris("x".repeat(300)),
    ];
    for (const m of tous) expect(m.length).toBeLessThan(LONGUEUR_MESSAGE_MAX);
  });

  it("l'aucun départ dit le trajet, le jour, le moment et l'heure demandée", () => {
    expect(
      fr.aucunDepart({ trajet: "Douala → Kribi", jour: "demain", periode: "matin", apres: null }),
    ).toBe(
      "Aucun départ demain matin pour Douala → Kribi. Essaie un autre jour ou un autre trajet.",
    );
    expect(
      fr.aucunDepart({
        trajet: "Douala → Kribi",
        jour: "aujourdhui",
        periode: null,
        apres: "14:00",
      }),
    ).toBe(
      "Aucun départ aujourd'hui à partir de 14:00 pour Douala → Kribi. Essaie un autre jour ou un autre trajet.",
    );
    expect(
      textes("en").aucunDepart({ trajet: "A → B", jour: "demain", periode: "soir", apres: null }),
    ).toBe("No departure tomorrow evening for A → B. Try another day or another trip.");
    expect(
      textes("pcm").aucunDepart({
        trajet: "A → B",
        jour: "apres_demain",
        periode: null,
        apres: null,
      }),
    ).toBe("No bus fo afta tumara fo A → B. Try anoda day or anoda road.");
  });

  it("le français est écrit avec ses accents", () => {
    expect(fr.villeInconnue("Garoua", ["Yaoundé"])).toContain("Je ne connais pas");
    expect(fr.dateNonLue).toContain("après-demain");
    expect(fr.placeReprise).toContain("remboursé");
    expect(fr.salutation).toContain("Écris « billet »");
  });
});

describe("textesInventes (liste du rapport de livraison)", () => {
  const inventes = textesInventes();

  it("ne contient aucun doublon et aucun message vide", () => {
    expect(new Set(inventes).size).toBe(inventes.length);
    expect(inventes.every((m) => m.trim().length > 0)).toBe(true);
  });

  it("ne contient pas les trois messages de la maquette", () => {
    const maquette = new Set([LISTE, PROPOSITION, PAYE].map((e) => e!.texte.join("\n")));
    expect(inventes.some((m) => maquette.has(m))).toBe(false);
  });

  it("couvre les trois langues", () => {
    expect(inventes).toContain(textes("fr").tropDErreurs);
    expect(inventes).toContain(textes("en").tropDErreurs);
    expect(inventes).toContain(textes("pcm").tropDErreurs);
    expect(inventes).toContain(textes("pcm").modeDegrade);
  });
});
