import { describe, expect, it } from "vitest";
import { calculerEmpreinte, verifierEmpreinte } from "./empreinte";
import { genererFichier } from "./fichiers";
import {
  analyserCsv,
  champCsv,
  creerZip,
  lettreColonne,
  lireZip,
  neutraliser,
  versCsv,
  versPdf,
  versWinAnsi,
  versXlsx,
  type MetaFichier,
} from "./formats";
import type { Onglet } from "./modele";
import { construireTableau } from "./tableaux";
import { AGENCE, creerMonde, peuplerMois } from "./testing/donnees";

const CLE = Buffer.alloc(32, 5);
const meta = (surcharge: Partial<MetaFichier> = {}): MetaFichier => ({
  exportId: "journal_ventes",
  titre: "Journal des ventes · décembre",
  mois: "2026-12",
  genereA: "2027-01-05T09:12:00.000+01:00",
  empreinte: "ab".repeat(32),
  ...surcharge,
});

const onglet = (lignes: Onglet["lignes"]): Onglet => ({
  id: "ventes",
  libelle: "Ventes",
  colonnes: ["date", "motif", "prix"],
  lignes,
  totalMontant: 0,
});

describe("CSV", () => {
  it("sépare par des points-virgules, termine les lignes par CRLF et met l'empreinte en dernière ligne", () => {
    const csv = versCsv(
      onglet([
        ["2026-12-01", "billet", 5000],
        ["2026-12-02", null, -3500],
      ]),
      meta(),
    ).toString("utf8");
    expect(csv).toBe(
      [
        "date;motif;prix",
        "2026-12-01;billet;5000",
        "2026-12-02;;-3500",
        `#AFRIMOVE;empreinte;HMAC-SHA-256;${"ab".repeat(32)};2027-01-05T09:12:00.000+01:00`,
        "",
      ].join("\r\n"),
    );
  });

  it('entoure de guillemets ce qui contient ; " ou un retour à la ligne', () => {
    expect(champCsv("a;b")).toBe('"a;b"');
    expect(champCsv('dit "oui"')).toBe('"dit ""oui"""');
    expect(champCsv("deux\nlignes")).toBe('"deux\nlignes"');
    expect(champCsv("simple")).toBe("simple");
    expect(champCsv(null)).toBe("");
    expect(champCsv(0)).toBe("0");
  });

  it("neutralise les formules mais jamais un nombre négatif", () => {
    for (const dangereux of ["=1+1", "+33", "-2", "@A1", "\tx", "\rx"]) {
      expect(neutraliser(dangereux)).toBe(`'${dangereux}`);
    }
    expect(neutraliser("normal")).toBe("normal");
    expect(champCsv(-1500)).toBe("-1500");
  });

  it("se relit à l'identique, guillemets, accents et retours à la ligne compris", () => {
    const lignes = [
      ["2026-12-01", 'a;b "c"', 1],
      ["2026-12-02", "é à ü\nsuite", 2],
    ] as Onglet["lignes"];
    const relu = analyserCsv(versCsv(onglet(lignes), meta()).toString("utf8"));
    expect(relu.colonnes).toEqual(["date", "motif", "prix"]);
    expect(relu.lignes).toEqual([
      ["2026-12-01", 'a;b "c"', "1"],
      ["2026-12-02", "é à ü\nsuite", "2"],
    ]);
    expect(relu.empreinte).toEqual({
      algorithme: "HMAC-SHA-256",
      valeur: "ab".repeat(32),
      genereA: "2027-01-05T09:12:00.000+01:00",
    });
  });
});

describe("zip", () => {
  it("écrit et relit des entrées avec leurs sommes de contrôle", () => {
    const zip = creerZip([
      { nom: "a.txt", contenu: Buffer.from("bonjour", "utf8") },
      { nom: "dossier/é.xml", contenu: Buffer.alloc(100_000, 7) },
    ]);
    const lu = lireZip(zip);
    expect(lu.get("a.txt")?.toString("utf8")).toBe("bonjour");
    expect(lu.get("dossier/é.xml")?.length).toBe(100_000);
  });

  it("refuse un zip dont un octet a été modifié", () => {
    const zip = creerZip([{ nom: "a.txt", contenu: Buffer.from("x".repeat(500), "utf8") }]);
    const abime = Buffer.from(zip);
    abime[abime.length - 80] = (abime[abime.length - 80]! + 1) % 256;
    expect(() => lireZip(abime)).toThrow();
  });
});

describe("XLSX", () => {
  const colonnes = ["date", "motif", "prix"];
  const onglets: Onglet[] = [
    {
      id: "ventes",
      libelle: "Ventes · 2",
      colonnes,
      lignes: [
        ["2026-12-01", "=2+2 & <b>", 5000],
        ["2026-12-02", null, -3500],
      ],
      totalMontant: 1500,
    },
    {
      id: "totaux",
      libelle: "Totaux",
      colonnes: ["indicateur", "valeur"],
      lignes: [["total", 1500]],
      totalMontant: 1500,
    },
  ];

  it("est un classeur Office bien formé : types de contenu, relations, un onglet par vue et l'empreinte", () => {
    const classeur = lireZip(versXlsx(onglets, meta()));
    expect([...classeur.keys()].sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "docProps/core.xml",
        "docProps/custom.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
        "xl/worksheets/sheet3.xml",
      ].sort(),
    );
    const texte = (nom: string) => classeur.get(nom)!.toString("utf8");
    for (const nom of classeur.keys()) expect(texte(nom).startsWith("<?xml")).toBe(true);
    expect(texte("xl/workbook.xml")).toContain('name="Ventes · 2"');
    expect(texte("xl/workbook.xml")).toContain('name="Totaux"');
    expect(texte("xl/workbook.xml")).toContain('name="Empreinte"');
    expect(texte("docProps/custom.xml")).toContain("ab".repeat(32));
    expect(texte("[Content_Types].xml")).toContain("/xl/worksheets/sheet3.xml");
  });

  it("écrit les nombres comme des nombres et le texte échappé et neutralisé", () => {
    const feuille = lireZip(versXlsx(onglets, meta()))
      .get("xl/worksheets/sheet1.xml")!
      .toString("utf8");
    expect(feuille).toContain('<c r="C2"><v>5000</v></c>');
    expect(feuille).toContain('<c r="C3"><v>-3500</v></c>');
    // =2+2 est une formule : neutralisée, et & < > échappés.
    expect(feuille).toContain("'=2+2 &amp; &lt;b&gt;");
    expect(feuille).not.toContain("<b>");
  });

  it("n'écrit pas les cellules vides", () => {
    const feuille = lireZip(versXlsx(onglets, meta()))
      .get("xl/worksheets/sheet1.xml")!
      .toString("utf8");
    expect(feuille).not.toContain('r="B3"');
  });

  it("l'onglet « Empreinte » porte la signature du fichier", () => {
    const feuille = lireZip(versXlsx(onglets, meta()))
      .get("xl/worksheets/sheet3.xml")!
      .toString("utf8");
    expect(feuille).toContain("HMAC-SHA-256");
    expect(feuille).toContain("ab".repeat(32));
    expect(feuille).toContain("2027-01-05T09:12:00.000+01:00");
  });

  it("donne les mêmes octets pour les mêmes données (aucune date de la machine dans le zip)", () => {
    expect(versXlsx(onglets, meta()).equals(versXlsx(onglets, meta()))).toBe(true);
    expect(
      versXlsx(onglets, meta()).equals(versXlsx(onglets, meta({ empreinte: "cd".repeat(32) }))),
    ).toBe(false);
  });

  it("garde des noms d'onglet valides et distincts", () => {
    const classeur = lireZip(
      versXlsx(
        [
          { ...onglets[0]!, libelle: "A/B:C?" },
          { ...onglets[0]!, libelle: "A-B-C-" },
          { ...onglets[0]!, libelle: "x".repeat(50) },
        ],
        meta(),
      ),
    );
    const noms = [
      ...classeur
        .get("xl/workbook.xml")!
        .toString("utf8")
        .matchAll(/name="([^"]+)"/g),
    ].map((m) => m[1]!);
    expect(new Set(noms.map((n) => n.toLowerCase())).size).toBe(noms.length);
    for (const nom of noms) {
      expect(nom.length).toBeLessThanOrEqual(31);
      expect(nom).not.toMatch(/[\\/?*[\]:]/);
    }
  });

  it("numérote les colonnes comme un tableur", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(lettreColonne)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });
});

describe("PDF", () => {
  const lignes = [
    { texte: "Factures AfriMove · décembre 2026", gras: true, taille: 16 },
    { texte: "Semaine du 30/11 au 06/12 (à payer) → 135 000 F" },
  ];

  it("est un PDF dont la table des références pointe sur les bons objets", () => {
    const { contenu, pages } = versPdf(lignes, meta({ exportId: "factures_afrimove" }));
    const texte = contenu.toString("latin1");
    expect(pages).toBe(1);
    expect(texte.startsWith("%PDF-1.4\n")).toBe(true);
    expect(texte.endsWith("%%EOF\n")).toBe(true);
    const debutXref = Number(/startxref\n(\d+)\n/.exec(texte)![1]);
    expect(texte.slice(debutXref, debutXref + 4)).toBe("xref");
    const entrees = [...texte.slice(debutXref).matchAll(/(\d{10}) 00000 n /g)].map((m) =>
      Number(m[1]),
    );
    expect(entrees.length).toBeGreaterThanOrEqual(7);
    entrees.forEach((decalage, i) => {
      expect(texte.slice(decalage, decalage + String(i + 1).length + 6)).toBe(`${i + 1} 0 obj`);
    });
  });

  it("écrit les accents en WinAnsi et remplace ce que la police ne sait pas écrire", () => {
    const { contenu } = versPdf(lignes, meta());
    const texte = contenu.toString("latin1");
    expect(texte).toContain("d\xe9cembre"); // é = 0xE9
    expect(texte).toContain("->"); // la flèche devient ->
    expect(versWinAnsi("(a)\\b")).toBe("\\(a\\)\\\\b");
    expect(versWinAnsi("œ’ — €")).toBe("\x9c\x92 \x97 \x80");
    expect(versWinAnsi("日")).toBe("?");
  });

  it("porte l'empreinte dans les informations du document et au pied de chaque page", () => {
    const { contenu } = versPdf(lignes, meta());
    const texte = contenu.toString("latin1");
    expect(texte).toContain(`/AfriMoveEmpreinte (${"ab".repeat(32)})`);
    expect(texte).toContain("empreinte " + "ab".repeat(16));
    expect(texte).toContain("D:20270105091200+01'00'");
  });

  it("passe à une nouvelle page quand il n'y a plus de place", () => {
    const beaucoup = Array.from({ length: 200 }, (_, i) => ({ texte: `Ligne ${i}` }));
    const { contenu, pages } = versPdf(beaucoup, meta());
    expect(pages).toBeGreaterThan(3);
    const texte = contenu.toString("latin1");
    expect(texte).toContain(`/Count ${pages}`);
    expect(texte).toContain(`page ${pages} / ${pages}`);
  });
});

describe("empreinte AfriMove", () => {
  async function exportDecembre() {
    const m = creerMonde();
    peuplerMois(m, AGENCE, "2026-12", { jours: 5 });
    const d = await m.chargeur.charger(AGENCE, "2026-12");
    return {
      d,
      tableau: construireTableau("annulations", d),
      ventes: construireTableau("journal_ventes", d),
    };
  }

  const contenu = (tableau: { onglets: Onglet[] }, genereA = "2027-01-05T09:12:00.000+01:00") => ({
    compagnieId: AGENCE,
    mois: "2026-12",
    exportId: "journal_ventes" as const,
    genereA,
    onglets: tableau.onglets,
  });

  it("est stable pour un même contenu, et change si la clé, le mois, l'export, la date ou une cellule change", async () => {
    const { ventes } = await exportDecembre();
    const base = calculerEmpreinte(CLE, contenu(ventes));
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(calculerEmpreinte(CLE, contenu(ventes))).toBe(base);
    expect(calculerEmpreinte(Buffer.alloc(32, 6), contenu(ventes))).not.toBe(base);
    expect(calculerEmpreinte(CLE, { ...contenu(ventes), mois: "2026-11" })).not.toBe(base);
    expect(calculerEmpreinte(CLE, { ...contenu(ventes), exportId: "journal_caisse" })).not.toBe(
      base,
    );
    expect(calculerEmpreinte(CLE, { ...contenu(ventes), compagnieId: "autre" })).not.toBe(base);
    expect(calculerEmpreinte(CLE, contenu(ventes, "2027-01-05T09:13:00.000+01:00"))).not.toBe(base);
    const retouche = structuredClone(ventes);
    (retouche.onglets[0]!.lignes[0]![6] as number) += 1;
    expect(calculerEmpreinte(CLE, contenu(retouche))).not.toBe(base);
    const ligneEnMoins = structuredClone(ventes);
    ligneEnMoins.onglets[0]!.lignes.pop();
    expect(calculerEmpreinte(CLE, contenu(ligneEnMoins))).not.toBe(base);
  });

  it("vérifie à temps constant et refuse une empreinte tronquée ou fantaisiste", async () => {
    const { ventes } = await exportDecembre();
    const bonne = calculerEmpreinte(CLE, contenu(ventes));
    expect(verifierEmpreinte(CLE, contenu(ventes), bonne)).toBe(true);
    expect(verifierEmpreinte(CLE, contenu(ventes), bonne.slice(0, 62))).toBe(false);
    expect(verifierEmpreinte(CLE, contenu(ventes), "zz")).toBe(false);
    expect(verifierEmpreinte(CLE, contenu(ventes), "0".repeat(64))).toBe(false);
  });

  it("un CSV retouché ne passe plus la vérification : toute retouche est détectable", async () => {
    const { d } = await exportDecembre();
    const m = creerMonde();
    const annul = construireTableau("annulations", d);
    annul.onglets[0]!.lignes.push([
      "2026-12-10",
      "10:00",
      "A-1",
      "billet",
      5000,
      "rembourser",
      "motif",
      "x",
      "y",
      "PIN",
    ]);
    const fichier = genererFichier({
      tableau: annul,
      compagnieId: AGENCE,
      mois: "2026-12",
      genereA: d.maintenant,
      cle: CLE,
    });
    const texte = fichier.contenu.toString("utf8");
    const relu = analyserCsv(texte);
    const verifier = (t: string) => {
      const a = analyserCsv(t);
      return verifierEmpreinte(
        CLE,
        {
          compagnieId: AGENCE,
          mois: "2026-12",
          exportId: "annulations",
          genereA: a.empreinte!.genereA,
          onglets: [{ id: "annulations", colonnes: a.colonnes, lignes: a.lignes }],
        },
        a.empreinte!.valeur,
      );
    };
    expect(relu.empreinte!.valeur).toBe(fichier.empreinte);
    expect(verifier(texte)).toBe(true);
    expect(verifier(texte.replace(";5000;", ";500;"))).toBe(false);
    expect(verifier(texte.replace("rembourser", "avoir"))).toBe(false);
    expect(m).toBeDefined();
  });

  it("un classeur XLSX retouché ne passe plus la vérification", async () => {
    const { d, ventes } = await exportDecembre();
    const fichier = genererFichier({
      tableau: ventes,
      compagnieId: AGENCE,
      mois: "2026-12",
      genereA: d.maintenant,
      cle: CLE,
    });
    const classeur = lireZip(fichier.contenu);
    const feuille = classeur.get("xl/worksheets/sheet1.xml")!.toString("utf8");
    const empreinteDuFichier = /<t xml:space="preserve">([0-9a-f]{64})<\/t>/.exec(
      classeur.get("xl/worksheets/sheet5.xml")!.toString("utf8"),
    )![1]!;
    expect(empreinteDuFichier).toBe(fichier.empreinte);

    // Relit les cellules de l'onglet « ventes » telles que le fichier les contient.
    const relire = (xml: string) =>
      [...xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map((r) =>
        [
          ...r[2]!.matchAll(
            /<c r="[A-Z]+\d+"[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g,
          ),
        ].map((c) => c[1] ?? c[2] ?? ""),
      );
    const lignes = relire(feuille).slice(1);
    const colonnes = relire(feuille)[0]!;
    const verifier = (l: string[][]) =>
      verifierEmpreinte(
        CLE,
        {
          compagnieId: AGENCE,
          mois: "2026-12",
          exportId: "journal_ventes",
          genereA: d.maintenant,
          onglets: [{ id: "ventes", colonnes, lignes: l }, ...ventes.onglets.slice(1)],
        },
        empreinteDuFichier,
      );
    // Les cellules vides ne sont pas écrites : on les restitue pour comparer colonne par colonne.
    const complet = ventes.onglets[0]!.lignes.map((l) =>
      l.map((c) => (c === null ? "" : String(c))),
    );
    expect(lignes.length).toBe(complet.length);
    expect(verifier(complet)).toBe(true);
    const retouche = complet.map((l) => [...l]);
    retouche[0]![6] = String(Number(retouche[0]![6]) + 1);
    expect(verifier(retouche)).toBe(false);
  });
});
