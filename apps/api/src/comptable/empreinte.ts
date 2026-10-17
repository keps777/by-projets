import { createHmac, timingSafeEqual } from "node:crypto";
import type { Cellule, IdExport } from "./modele";

/**
 * Empreinte AfriMove d'un export : un HMAC-SHA-256 du **contenu du tableau** (colonnes et lignes de chaque
 * onglet, lues comme du texte), de la compagnie, du mois, de l'export et de l'instant de génération. La clé
 * est celle du journal d'audit (`AUDIT_HMAC_KEY`), mêlée à un préfixe propre aux exports : seul AfriMove peut
 * produire une empreinte valide, et toute retouche d'une cellule, d'une ligne, de la date ou du mois la
 * rend fausse. Lue comme du texte, elle est la même pour le CSV, le classeur XLSX et le PDF d'un même tableau.
 */

const PREFIXE = "afrimove-export-v1";

export interface ContenuSigne {
  compagnieId: string;
  mois: string;
  exportId: IdExport;
  genereA: string;
  onglets: ReadonlyArray<{
    id: string;
    colonnes: readonly string[];
    lignes: ReadonlyArray<ReadonlyArray<Cellule | undefined>>;
  }>;
}

const enTexte = (c: Cellule | undefined): string =>
  c === null || c === undefined ? "" : String(c);

function canonique(contenu: ContenuSigne): string {
  return JSON.stringify([
    contenu.compagnieId,
    contenu.mois,
    contenu.exportId,
    contenu.genereA,
    contenu.onglets.map((o) => [o.id, [...o.colonnes], o.lignes.map((l) => l.map(enTexte))]),
  ]);
}

export function calculerEmpreinte(cle: Buffer, contenu: ContenuSigne): string {
  return createHmac("sha256", cle)
    .update(PREFIXE)
    .update("\n")
    .update(canonique(contenu))
    .digest("hex");
}

/** Vrai si l'empreinte annoncée est celle que ce contenu produit (comparaison à temps constant). */
export function verifierEmpreinte(cle: Buffer, contenu: ContenuSigne, annoncee: string): boolean {
  const attendue = Buffer.from(calculerEmpreinte(cle, contenu), "hex");
  const recue = Buffer.from(annoncee, "hex");
  return recue.length === attendue.length && timingSafeEqual(recue, attendue);
}
