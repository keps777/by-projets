import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import type { Cellule, IdExport, LignePdf, Onglet } from "./modele";

/**
 * Écriture des trois formats d'export, sans dépendance : CSV, XLSX (un zip de fichiers XML) et PDF.
 * Les trois sont **déterministes** : mêmes données et même instant de génération, mêmes octets. C'est ce
 * qui permet de dire « le fichier téléchargé est exactement celui prévisualisé » et de comparer deux
 * générations. Chacun porte l'empreinte AfriMove (voir `empreinte.ts`).
 */

/** Ce que le fichier dit de lui-même, empreinte comprise. */
export interface MetaFichier {
  exportId: IdExport;
  /** « Journal des ventes · décembre » */
  titre: string;
  mois: string;
  genereA: string;
  /** Hex du HMAC-SHA-256 du contenu du tableau. */
  empreinte: string;
}

export const ALGORITHME_EMPREINTE = "HMAC-SHA-256";
export const EDITEUR = "AfriMove";

/* ------------------------------------------------------------------ CSV */

const SEPARATEUR = ";";
const FIN_DE_LIGNE = "\r\n";
export const MARQUE_EMPREINTE_CSV = "#AFRIMOVE";

/**
 * Une cellule de texte qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot serait lue
 * comme une formule par un tableur (injection de formule) : on la préfixe d'une apostrophe. Les nombres
 * ne sont jamais touchés (un montant négatif reste un nombre).
 */
export function neutraliser(texte: string): string {
  return /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
}

export function champCsv(cellule: Cellule): string {
  if (cellule === null) return "";
  if (typeof cellule === "number") return String(cellule);
  const texte = neutraliser(cellule);
  return /[;"\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

export function ligneCsv(cellules: readonly Cellule[]): string {
  return cellules.map(champCsv).join(SEPARATEUR);
}

/** Le CSV d'un onglet : l'en-tête, les lignes, puis la ligne d'empreinte (`#AFRIMOVE;…`). */
export function versCsv(onglet: Onglet, meta: MetaFichier): Buffer {
  const lignes = [
    ligneCsv(onglet.colonnes),
    ...onglet.lignes.map(ligneCsv),
    [MARQUE_EMPREINTE_CSV, "empreinte", ALGORITHME_EMPREINTE, meta.empreinte, meta.genereA].join(
      SEPARATEUR,
    ),
  ];
  return Buffer.from(lignes.join(FIN_DE_LIGNE) + FIN_DE_LIGNE, "utf8");
}

/** Les premières lignes du CSV d'un onglet, telles qu'elles sont écrites (sans ligne d'empreinte). */
export function apercuCsv(onglet: Onglet, lignes: number): string[] {
  return [ligneCsv(onglet.colonnes), ...onglet.lignes.slice(0, lignes).map(ligneCsv)];
}

export interface CsvAnalyse {
  colonnes: string[];
  lignes: string[][];
  empreinte: { algorithme: string; valeur: string; genereA: string } | null;
}

/** Relit un CSV écrit par `versCsv` (vérification d'une empreinte, tests). */
export function analyserCsv(texte: string): CsvAnalyse {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]!;
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') {
        entreGuillemets = false;
      } else {
        champ += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === SEPARATEUR) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else {
      champ += c;
    }
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  let empreinte: CsvAnalyse["empreinte"] = null;
  const corps = lignes.filter((l) => {
    if (l[0] === MARQUE_EMPREINTE_CSV) {
      empreinte = { algorithme: l[2] ?? "", valeur: l[3] ?? "", genereA: l[4] ?? "" };
      return false;
    }
    return true;
  });
  return { colonnes: corps[0] ?? [], lignes: corps.slice(1), empreinte };
}

/* ------------------------------------------------------------------ zip (XLSX) */

interface EntreeZip {
  nom: string;
  contenu: Buffer;
}

/** Date et heure DOS fixes (1980-01-01 00:00) : le zip ne dépend pas de l'heure de la machine. */
const DOS_HEURE = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function creerZip(entrees: readonly EntreeZip[]): Buffer {
  const parties: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const entree of entrees) {
    const nom = Buffer.from(entree.nom, "utf8");
    const compresse = deflateRawSync(entree.contenu, { level: 6 });
    const crc = crc32(entree.contenu);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_HEURE, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compresse.length, 18);
    local.writeUInt32LE(entree.contenu.length, 22);
    local.writeUInt16LE(nom.length, 26);
    local.writeUInt16LE(0, 28);
    parties.push(local, nom, compresse);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_HEURE, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compresse.length, 20);
    central.writeUInt32LE(entree.contenu.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nom);

    decalage += local.length + nom.length + compresse.length;
  }
  const tailleCentral = centraux.reduce((somme, b) => somme + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...parties, ...centraux, fin]);
}

/** Relit un zip écrit par `creerZip` et vérifie les sommes de contrôle (tests). */
export function lireZip(zip: Buffer): Map<string, Buffer> {
  const sorties = new Map<string, Buffer>();
  const fin = zip.length - 22;
  if (fin < 0 || zip.readUInt32LE(fin) !== 0x06054b50) throw new Error("Zip invalide");
  const nombre = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  for (let i = 0; i < nombre; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("Répertoire central invalide");
    const crc = zip.readUInt32LE(p + 16);
    const tailleCompresse = zip.readUInt32LE(p + 20);
    const tailleOrigine = zip.readUInt32LE(p + 24);
    const longueurNom = zip.readUInt16LE(p + 28);
    const debutLocal = zip.readUInt32LE(p + 42);
    const nom = zip.subarray(p + 46, p + 46 + longueurNom).toString("utf8");
    const longueurNomLocal = zip.readUInt16LE(debutLocal + 26);
    const longueurExtra = zip.readUInt16LE(debutLocal + 28);
    const debutDonnees = debutLocal + 30 + longueurNomLocal + longueurExtra;
    const contenu = inflateRawSync(zip.subarray(debutDonnees, debutDonnees + tailleCompresse));
    if (contenu.length !== tailleOrigine || crc32(contenu) !== crc) {
      throw new Error(`Entrée corrompue : ${nom}`);
    }
    sorties.set(nom, contenu);
    p += 46 + longueurNom;
  }
  return sorties;
}

/* ------------------------------------------------------------------ XLSX */

const XML_INTERDIT = /[^\u0009\u000A\u000D -퟿-�]/g;

function xml(texte: string): string {
  return texte
    .replace(XML_INTERDIT, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A, B … Z, AA, AB … */
export function lettreColonne(indice: number): string {
  let n = indice + 1;
  let lettres = "";
  while (n > 0) {
    const reste = (n - 1) % 26;
    lettres = String.fromCharCode(65 + reste) + lettres;
    n = Math.floor((n - 1) / 26);
  }
  return lettres;
}

function celluleXlsx(ref: string, cellule: Cellule, style: number): string {
  const s = style > 0 ? ` s="${style}"` : "";
  if (cellule === null) return "";
  if (typeof cellule === "number") return `<c r="${ref}"${s}><v>${String(cellule)}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xml(neutraliser(cellule))}</t></is></c>`;
}

function feuilleXlsx(onglet: Pick<Onglet, "colonnes" | "lignes">): string {
  const largeurs = onglet.colonnes.map((c, i) => {
    let max = c.length;
    for (const l of onglet.lignes.slice(0, 200)) {
      const v = l[i];
      if (v !== null && v !== undefined) max = Math.max(max, String(v).length);
    }
    return Math.min(40, Math.max(8, max + 2));
  });
  const cols = largeurs
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const lignes: string[] = [];
  const entete = onglet.colonnes.map((c, i) => celluleXlsx(`${lettreColonne(i)}1`, c, 1)).join("");
  lignes.push(`<row r="1">${entete}</row>`);
  onglet.lignes.forEach((ligne, r) => {
    const cellules = ligne.map((v, i) => celluleXlsx(`${lettreColonne(i)}${r + 2}`, v, 0)).join("");
    lignes.push(`<row r="${r + 2}">${cellules}</row>`);
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols><sheetData>${lignes.join("")}</sheetData></worksheet>`
  );
}

function nomFeuille(libelle: string, pris: Set<string>): string {
  const base = libelle.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Feuille";
  let nom = base;
  for (let i = 2; pris.has(nom.toLowerCase()); i++) {
    nom = `${base.slice(0, 31 - String(i).length - 1)}-${i}`;
  }
  pris.add(nom.toLowerCase());
  return nom;
}

/** Le nom de l'onglet qui porte l'empreinte dans un classeur AfriMove. */
export const FEUILLE_EMPREINTE = "Empreinte";

/** Le classeur : un onglet par vue, plus un onglet « Empreinte » et la propriété personnalisée du fichier. */
export function versXlsx(onglets: readonly Onglet[], meta: MetaFichier): Buffer {
  const empreinte: Pick<Onglet, "colonnes" | "lignes"> = {
    colonnes: ["champ", "valeur"],
    lignes: [
      ["editeur", EDITEUR],
      ["export", meta.titre],
      ["mois", meta.mois],
      ["genere_a", meta.genereA],
      ["algorithme", ALGORITHME_EMPREINTE],
      ["empreinte", meta.empreinte],
    ],
  };
  const feuilles = [...onglets, { libelle: FEUILLE_EMPREINTE, ...empreinte }];
  const pris = new Set<string>();
  const noms = feuilles.map((f) => nomFeuille(f.libelle, pris));
  const creation = new Date(meta.genereA).toISOString().replace(/\.\d{3}Z$/, "Z");

  const entrees: EntreeZip[] = [];
  const ajouter = (nom: string, contenu: string) =>
    entrees.push({ nom, contenu: Buffer.from(contenu, "utf8") });
  const entete = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  ajouter(
    "[Content_Types].xml",
    `${entete}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>' +
      feuilles
        .map(
          (_f, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      "</Types>",
  );
  ajouter(
    "_rels/.rels",
    `${entete}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/>' +
      "</Relationships>",
  );
  ajouter(
    "docProps/core.xml",
    `${entete}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${xml(meta.titre)}</dc:title><dc:creator>${EDITEUR}</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${creation}</dcterms:created></cp:coreProperties>`,
  );
  ajouter(
    "docProps/custom.xml",
    `${entete}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
      `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="AfriMoveEmpreinte"><vt:lpwstr>${xml(meta.empreinte)}</vt:lpwstr></property></Properties>`,
  );
  ajouter(
    "xl/workbook.xml",
    `${entete}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      noms
        .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("") +
      "</sheets></workbook>",
  );
  ajouter(
    "xl/_rels/workbook.xml.rels",
    `${entete}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      feuilles
        .map(
          (_f, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      "</Relationships>",
  );
  ajouter(
    "xl/styles.xml",
    `${entete}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );
  feuilles.forEach((f, i) => ajouter(`xl/worksheets/sheet${i + 1}.xml`, feuilleXlsx(f)));
  return creerZip(entrees);
}

/* ------------------------------------------------------------------ PDF */

const LARGEUR_PAGE = 595;
const HAUTEUR_PAGE = 842;
const MARGE = 50;
const HAUT = 792;
const BAS = 64;

const WIN_ANSI: Readonly<Record<string, number>> = {
  "€": 0x80,
  "‚": 0x82,
  "„": 0x84,
  "…": 0x85,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  Œ: 0x8c,
  œ: 0x9c,
};

const REMPLACEMENTS: Readonly<Record<string, string>> = {
  "→": "->",
  "←": "<-",
  "−": "-",
  " ": " ",
  " ": " ",
  " ": " ",
};

/** Texte vers les octets WinAnsi de la police Helvetica (accents français compris), échappé pour un PDF. */
export function versWinAnsi(texte: string): string {
  let sortie = "";
  for (const c of texte) {
    const remplace = REMPLACEMENTS[c] ?? c;
    for (const car of remplace) {
      const code = WIN_ANSI[car] ?? car.codePointAt(0) ?? 63;
      const octet = code <= 0xff ? code : 63;
      const ch = String.fromCharCode(octet);
      if (ch === "\\" || ch === "(" || ch === ")") sortie += `\\${ch}`;
      else if (octet < 32) sortie += " ";
      else sortie += ch;
    }
  }
  return sortie;
}

function dateCreationPdf(genereA: string): string {
  // genereA est un ISO Douala : `2027-01-05T14:05:00.000+01:00` -> `D:20270105140500+01'00'`.
  const d = genereA.replace(/[-:T]/g, "");
  return `D:${d.slice(0, 14)}+01'00'`;
}

/** Le PDF : les lignes de texte, sur autant de pages A4 qu'il en faut, l'empreinte en pied de chaque page. */
export function versPdf(
  lignes: readonly LignePdf[],
  meta: MetaFichier,
): { contenu: Buffer; pages: number } {
  const pages: LignePdf[][] = [[]];
  let y = HAUT;
  for (const ligne of lignes) {
    const taille = ligne.taille ?? 10;
    const interligne = Math.round(taille * 1.45);
    if (y - interligne < BAS) {
      pages.push([]);
      y = HAUT;
    }
    pages[pages.length - 1]!.push(ligne);
    y -= interligne;
  }

  const objets: string[] = [];
  // 1 catalogue, 2 pages, 3 et 4 polices, 5 informations, puis (page, contenu) par page.
  const idPage = (i: number) => 6 + 2 * i;
  const idContenu = (i: number) => 7 + 2 * i;
  objets[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objets[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_p, i) => `${idPage(i)} 0 R`).join(" ")}] >>`;
  objets[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objets[4] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objets[5] =
    `<< /Title (${versWinAnsi(meta.titre)}) /Author (${EDITEUR}) /Producer (${EDITEUR}) ` +
    `/CreationDate (${dateCreationPdf(meta.genereA)}) /AfriMoveEmpreinte (${meta.empreinte}) >>`;

  pages.forEach((contenuPage, i) => {
    let courant = HAUT;
    const flux: string[] = [];
    for (const l of contenuPage) {
      const taille = l.taille ?? 10;
      courant -= Math.round(taille * 1.45);
      flux.push(
        `BT /${l.gras ? "F2" : "F1"} ${taille} Tf ${MARGE} ${courant} Td (${versWinAnsi(l.texte)}) Tj ET`,
      );
    }
    flux.push(
      `BT /F1 8 Tf ${MARGE} 30 Td (${versWinAnsi(`${EDITEUR} · empreinte ${meta.empreinte.slice(0, 32)} · page ${i + 1} / ${pages.length}`)}) Tj ET`,
    );
    const texte = flux.join("\n");
    objets[idPage(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGEUR_PAGE} ${HAUTEUR_PAGE}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idContenu(i)} 0 R >>`;
    objets[idContenu(i)] = `<< /Length ${texte.length} >>\nstream\n${texte}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const decalages: number[] = [];
  for (let id = 1; id < objets.length; id++) {
    decalages[id] = pdf.length;
    pdf += `${id} 0 obj\n${objets[id]}\nendobj\n`;
  }
  const debutXref = pdf.length;
  pdf += `xref\n0 ${objets.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objets.length; id++) {
    pdf += `${String(decalages[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objets.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`;
  return { contenu: Buffer.from(pdf, "latin1"), pages: pages.length };
}
