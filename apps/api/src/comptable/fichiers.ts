import { gunzipSync, gzipSync } from "node:zlib";
import { calculerEmpreinte } from "./empreinte";
import { versCsv, versPdf, versXlsx, type MetaFichier } from "./formats";
import type { FichierFige, FichierGenere, TableauFixe, Onglet, Cellule, IdExport } from "./modele";
import { FORMAT_EXPORT, TYPE_MIME, nomAvecMois, nomDeFichier } from "./tableaux";

/**
 * Du tableau au fichier : choisit le format de l'export, calcule l'empreinte, écrit CSV, XLSX ou PDF. Le
 * même tableau sert à l'aperçu : ce que le comptable voit est ce que le fichier contient.
 */

export interface DemandeFichier {
  tableau: TableauFixe;
  compagnieId: string;
  mois: string;
  /** Instant de génération (ISO Douala), écrit dans le fichier et signé avec lui. */
  genereA: string;
  /** Clé de l'empreinte (celle du journal d'audit). */
  cle: Buffer;
}

export function genererFichier(demande: DemandeFichier): FichierGenere {
  const { tableau, compagnieId, mois, genereA, cle } = demande;
  const id = tableau.id;
  const format = FORMAT_EXPORT[id];
  const nom = nomAvecMois(id, mois);
  const empreinte = calculerEmpreinte(cle, {
    compagnieId,
    mois,
    exportId: id,
    genereA,
    onglets: tableau.onglets,
  });
  const meta: MetaFichier = { exportId: id, titre: nom, mois, genereA, empreinte };
  const premier = tableau.onglets[0];
  if (!premier) throw new Error(`Export ${id} sans onglet`);

  let contenu: Buffer;
  let pages: number | null = null;
  if (format === "XLSX") {
    contenu = versXlsx(tableau.onglets, meta);
  } else if (format === "CSV") {
    contenu = versCsv(premier, meta);
  } else {
    const pdf = versPdf(tableau.texte, meta);
    contenu = pdf.contenu;
    pages = pdf.pages;
  }
  return {
    id,
    format,
    nom,
    nomFichier: nomDeFichier(id, mois),
    typeMime: TYPE_MIME[format],
    contenu,
    empreinte,
    genereA,
    colonnes: premier.colonnes.length,
    lignes: tableau.lignes,
    pages,
  };
}

/* ------------------------------------------------------------------ tableau figé (aperçu d'un mois clos) */

/** Le tableau d'un export clos, compressé : l'aperçu d'un mois verrouillé le relit sans rien recalculer. */
export function compresserTableau(tableau: TableauFixe): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(tableau), "utf8"));
}

export function decompresserTableau(gz: Buffer): TableauFixe {
  return JSON.parse(gunzipSync(gz).toString("utf8")) as TableauFixe;
}

export function figer(fichier: FichierGenere, tableau: TableauFixe): FichierFige {
  return { ...fichier, tableauGz: compresserTableau(tableau) };
}

/* ------------------------------------------------------------------ aperçu */

/** Combien de lignes l'aperçu montre : les 10 premières. */
export const LIGNES_APERCU = 10;

export interface ApercuConstruit {
  export: {
    id: IdExport;
    format: "XLSX" | "CSV" | "PDF";
    nom: string;
    lignes: number;
    colonnes: number;
    tailleOctets: number;
    genereA: string;
  };
  onglets: { id: string; libelle: string }[];
  tableau: {
    colonnes: string[];
    lignes: Cellule[][];
    premiere: number;
    derniere: number;
    total: number;
    totalMontant: number;
  };
  signe: boolean;
}

export class OngletInconnu extends Error {
  constructor(readonly onglet: string) {
    super(`Onglet inconnu : ${onglet}`);
  }
}

/**
 * L'aperçu `ApercuExport` des contrats patron : les premières lignes de l'onglet demandé (le premier par
 * défaut), le nombre de lignes de tout le fichier, le total en FCFA. Le fichier est toujours signé.
 */
export function construireApercu(
  tableau: TableauFixe,
  fichier: FichierGenere,
  ongletId?: string,
): ApercuConstruit {
  const premier = tableau.onglets[0];
  if (!premier) throw new Error(`Export ${tableau.id} sans onglet`);
  const choisi: Onglet | undefined =
    ongletId === undefined ? premier : tableau.onglets.find((o) => o.id === ongletId);
  if (!choisi) throw new OngletInconnu(ongletId ?? "");
  const lignes = choisi.lignes.slice(0, LIGNES_APERCU);
  return {
    export: {
      id: tableau.id,
      format: fichier.format,
      nom: fichier.nom,
      lignes: premier.lignes.length,
      colonnes: premier.colonnes.length,
      tailleOctets: fichier.contenu.length,
      genereA: fichier.genereA,
    },
    onglets: tableau.onglets.map((o) => ({ id: o.id, libelle: o.libelle })),
    tableau: {
      colonnes: [...choisi.colonnes],
      lignes,
      premiere: 1,
      // Le contrat veut une borne positive même pour un tableau vide.
      derniere: Math.max(1, lignes.length),
      total: choisi.lignes.length,
      totalMontant: choisi.totalMontant,
    },
    signe: true,
  };
}
