/** Formats d'affichage du rapprochement MoMo (valeurs de la planche : « 16 000 », « 3 déc. 11:42 », « 0,2 % »). */

import type { patron } from "@afrimove/contrats";

type Transaction = patron.TransactionSansCorrespondance;
type Action = patron.ActionRapprochement;

/** Groupes de trois chiffres séparés par une espace : `16000` -> `16 000`. */
export function milliers(valeur: number): string {
  const groupes = String(Math.abs(Math.trunc(valeur))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return valeur < 0 ? `− ${groupes}` : groupes;
}

const MOIS_ABREGES = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

/**
 * `2026-12-03T11:42:00.000+01:00` -> `3 déc. 11:42`. Les instants de l'API sont déjà à l'heure de Douala
 * (`+01:00`) : on lit le jour et l'heure tels qu'ils sont écrits, sans passer par le fuseau de l'appareil.
 */
export function instantCourt(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const mois = MOIS_ABREGES[Number(m[1]) - 1];
  return mois ? `${Number(m[2])} ${mois} ${m[3]}:${m[4]}` : iso;
}

/** `0.2` -> `0,2 %` ; `5` -> `5 %` (une décimale au plus, virgule française). */
export function pourcentage(valeur: number): string {
  const arrondi = Math.round(valeur * 10) / 10;
  return `${String(arrondi).replace(".", ",")} %`;
}

/** Première partie du libellé du mois : `Décembre 2026` -> `Décembre` (la planche n'écrit pas l'année). */
export function nomDuMois(libelle: string): string {
  return libelle.split(" ")[0] ?? libelle;
}

/** Une ligne est ouverte tant qu'aucune décision n'a été appliquée. */
export function lignesOuvertes(lignes: readonly Transaction[]): Transaction[] {
  return lignes.filter((l) => l.decision === null);
}

/** Le total à traiter : seules les lignes encore ouvertes comptent. */
export function totalATraiter(lignes: readonly Transaction[]): number {
  return lignesOuvertes(lignes).reduce((somme, l) => somme + l.montant, 0);
}

/** Combien de lignes ouvertes pour chaque action proposée (« 2 remboursements · 1 rattachement · 1 réclamation »). */
export function decompte(lignes: readonly Transaction[]): Record<Action, number> {
  const compte: Record<Action, number> = { rembourser: 0, rattacher: 0, demander: 0 };
  for (const l of lignesOuvertes(lignes)) compte[l.actionProposee] += 1;
  return compte;
}

export interface SegmentExplication {
  texte: string;
  /** Suffixe ordinal à écrire en exposant (« e », « er »). */
  exposant?: string;
}

/**
 * Découpe une explication autour des rangs ordinaux (« 2e », « 1er ») que la planche écrit en exposant :
 * `2e paiement` -> `[{ texte: "2", exposant: "e" }, { texte: " paiement" }]`.
 */
export function segmentsExplication(texte: string): SegmentExplication[] {
  const segments: SegmentExplication[] = [];
  let debut = 0;
  for (const m of texte.matchAll(/\b(\d+)(er|e)\b/g)) {
    const index = m.index ?? 0;
    if (index > debut) segments.push({ texte: texte.slice(debut, index) });
    segments.push({ texte: m[1] ?? "", exposant: m[2] ?? "" });
    debut = index + m[0].length;
  }
  if (debut < texte.length) segments.push({ texte: texte.slice(debut) });
  return segments;
}

/** Ton de l'explication : vert quand la cause est établie, bleu quand il faut rattacher, rouge quand elle est inconnue. */
export type TonCause = "vert" | "bleu" | "rouge";

export function tonDeLaCause(cause: Transaction["cause"]): TonCause {
  switch (cause) {
    case "doublon_paiement":
    case "paiement_apres_expiration":
      return "vert";
    case "scan_depot_manquant":
      return "bleu";
    case "inconnue":
      return "rouge";
  }
}
