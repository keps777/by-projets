/** Formats d'affichage de la planche Financement (valeurs de la maquette : « 12 M », « 1,1 M », « 100 000 », « 7,5 »). */

function decimale(valeur: number): string {
  return String(valeur).replace(".", ",");
}

/** Groupes de trois chiffres séparés par une espace : `100000` -> `100 000`. */
export function milliers(fcfa: number): string {
  return String(Math.trunc(Math.abs(fcfa))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Montant d'une avance comme la planche l'écrit : `12000000` -> `12 M`, `1100000` -> `1,1 M`, `6000000` -> `6 M`
 * (deux décimales au plus, sans zéro inutile). Sous le million, les groupes de trois chiffres : `800000` -> `800 000`.
 */
export function montantCourt(fcfa: number): string {
  if (fcfa >= 1_000_000) return `${decimale(Math.round(fcfa / 10_000) / 100)} M`;
  return milliers(fcfa);
}

/** Pourcentage entier ou décimal à la française : `8` -> `8`, `7.5` -> `7,5`. */
export function pourcent(valeur: number): string {
  return decimale(valeur);
}

/** Part du plafond que représente le montant proposé, bornée à 0-100 : place du curseur de la planche (6 M sur 12 M = 50). */
export function partDuPlafond(montant: number, plafond: number): number {
  if (!(plafond > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((montant / plafond) * 10_000) / 100));
}
