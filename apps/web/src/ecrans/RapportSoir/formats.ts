/**
 * Formats du rapport du soir, comme la planche RapportSoir.dc.html les écrit : « 1 004 », « 4,41 M », « − 1 000 »,
 * « +6 % », « 21:00 ». Les montants de l'API sont des entiers de FCFA.
 */

/** `2027-01-05T21:00:00.000+01:00` -> `21:00` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

function decimale(valeur: number): string {
  return String(valeur).replace(".", ",");
}

/** Groupes de trois chiffres séparés par une espace : `1004` -> `1 004`. */
export function groupes(entier: number): string {
  return String(Math.abs(Math.round(entier))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Écart de caisse : `-1000` -> `− 1 000` (vrai signe moins, une espace), `0` -> `0`, `500` -> `+ 500`. */
export function ecart(fcfa: number): string {
  if (fcfa === 0) return "0";
  return `${fcfa < 0 ? "−" : "+"} ${groupes(fcfa)}`;
}

/** Montant rendu au client : `20000` -> `20 000 F`. */
export function francs(fcfa: number): string {
  return `${fcfa < 0 ? "− " : ""}${groupes(fcfa)} F`;
}

/** Variation des billets face à la veille : `6` -> `+6 %`, `-3,5` -> `−3,5 %`, `0` -> `0 %`. */
export function variation(pourcent: number): string {
  if (pourcent === 0) return "0 %";
  return `${pourcent < 0 ? "−" : "+"}${decimale(Math.abs(pourcent))} %`;
}

/** Pourcentage entier (remplissage, part des ventes en ligne) : `83,7` -> `84`. */
export function pourcentEntier(pourcent: number): string {
  return String(Math.round(pourcent));
}

export type Echelle = "M" | "k" | "F";

/** L'échelle de la recette : en millions dès 1 M, en milliers dès 1 000, en francs en dessous. */
export function echelleDe(recette: number): Echelle {
  const absolu = Math.abs(recette);
  if (absolu >= 1_000_000) return "M";
  if (absolu >= 1000) return "k";
  return "F";
}

/**
 * Montant court dans une échelle : `4410000` en M -> `4,41` (deux décimales au plus), `612500` en k -> `612,5`
 * (une décimale au plus), `950` en F -> `950`. Sans zéro inutile.
 */
export function montantCourt(fcfa: number, echelle: Echelle): string {
  const signe = fcfa < 0 ? "−" : "";
  const absolu = Math.abs(fcfa);
  if (echelle === "M") return `${signe}${decimale(Math.round(absolu / 10_000) / 100)}`;
  if (echelle === "k") return `${signe}${decimale(Math.round(absolu / 100) / 10)}`;
  return `${signe}${groupes(absolu)}`;
}

/** Le chiffre de la tuile « Recette » : `4,41 M`, `612 k`, `950`. */
export function recetteCourte(fcfa: number): string {
  const echelle = echelleDe(fcfa);
  return echelle === "F" ? montantCourt(fcfa, "F") : `${montantCourt(fcfa, echelle)} ${echelle}`;
}

/**
 * La part du cash ou du mobile money sous la recette : la planche écrit `2,9` et `1,5` (l'unité M est celle de la
 * recette) ; en milliers, l'unité suit chaque montant (`600 k`).
 */
export function partCourte(fcfa: number, echelle: Echelle): string {
  const valeur = montantCourt(fcfa, echelle);
  return echelle === "k" ? `${valeur} k` : valeur;
}
