/**
 * Formats de l'assistant, comme la planche Assistant.dc.html les écrit : « + 1,5 M » (gain par mois). Les montants de
 * l'API sont des entiers de FCFA.
 */

function decimale(valeur: number): string {
  return String(valeur).replace(".", ",");
}

/** Groupes de trois chiffres séparés par une espace : `1500` -> `1 500`. */
function groupes(entier: number): string {
  return String(Math.abs(Math.round(entier))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Gain (ou perte) par mois : `1500000` -> `+ 1,5 M`, `850000` -> `+ 850 k`, `-310000` -> `− 310 k`,
 * `950` -> `+ 950 F`. Le signe est écrit avec une espace (vrai signe moins), deux décimales au plus en millions, une
 * en milliers, sans zéro inutile. Zéro s'écrit `0 F`.
 */
export function gainMensuel(fcfa: number): string {
  if (fcfa === 0) return "0 F";
  const signe = fcfa < 0 ? "−" : "+";
  const absolu = Math.abs(fcfa);
  if (absolu >= 1_000_000) return `${signe} ${decimale(Math.round(absolu / 10_000) / 100)} M`;
  if (absolu >= 1000) return `${signe} ${decimale(Math.round(absolu / 100) / 10)} k`;
  return `${signe} ${groupes(absolu)} F`;
}

export interface Barre {
  /** Le jour (1 = le plus ancien) porte un écart négatif. */
  concerne: boolean;
}

/** Une barre par jour de la période ; celles des jours concernés sont en ambre. */
export function barres(periodeJours: number, joursConcernes: readonly number[]): Barre[] {
  const concernes = new Set(joursConcernes);
  return Array.from({ length: Math.max(0, periodeJours) }, (_, i) => ({
    concerne: concernes.has(i + 1),
  }));
}
