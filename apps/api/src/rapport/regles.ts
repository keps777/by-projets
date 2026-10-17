/** Règles du rapport du soir : constantes réglables et petits formats (français). */

/** Heure d'envoi du rapport, heure de Douala. */
export const HEURE_RAPPORT = "21:00";

/** En dessous de ce taux de remplissage, un départ est signalé dans le rapport (à confirmer). */
export const SEUIL_REMPLISSAGE_BAS_PCT = 60;

/** Un rapport plus ancien que cela n'est plus produit à la demande (jours). */
export const JOURS_HISTORIQUE = 31;

/** États d'un billet qui ne comptent pas comme une vente. */
export const ETATS_BILLET_HORS_VENTE = ["annule", "reserve"] as const;

const ESPACE_FINE = " ";
const MOINS = "−";

/** `1004` → `1 004` (espace fine insécable). */
export function grouper(n: number): string {
  return String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE);
}

/** `-1000` → `−1 000 F`, `500` → `500 F`. */
export function formaterFcfa(n: number): string {
  return `${n < 0 ? MOINS : ""}${grouper(n)} F`;
}

/** `1 billet`, `2 billets` (zéro et un au singulier, comme en français). */
export function pluriel(n: number, un: string, plusieurs: string): string {
  return `${grouper(n)} ${Math.abs(n) >= 2 ? plusieurs : un}`;
}

/** Pourcentage arrondi à une décimale : `84.34` → `84.3`. */
export function arrondir1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** `part` sur `total` en pourcentage à une décimale ; `0` quand il n'y a rien à comparer. */
export function pourcentage(part: number, total: number): number {
  return total > 0 ? arrondir1((part * 100) / total) : 0;
}

/** Évolution de `actuel` par rapport à `reference`, en % à une décimale ; `0` sans référence. */
export function variationPct(actuel: number, reference: number): number {
  return reference > 0 ? arrondir1(((actuel - reference) * 100) / reference) : 0;
}

/** Valeurs distinctes, dans l'ordre où elles apparaissent. */
export function distincts<T>(valeurs: readonly T[]): T[] {
  return [...new Set(valeurs)];
}
