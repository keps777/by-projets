import type { Analyses } from "./types";

/** Formats d'affichage des analyses (valeurs de la planche : « 14,2 M », « 4,0 M », « + 2,8 M », « + 5 % », « 2 104 »). */

function decimale(valeur: number): string {
  return valeur.toFixed(1).replace(".", ",");
}

/** Groupes de trois chiffres séparés par une espace : `2104` -> `2 104`. */
export function groupes(entier: number): string {
  return String(Math.abs(Math.round(entier))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Montant en millions avec une décimale, zéro compris, comme la planche : `14200000` -> `14,2 M`, `4000000` -> `4,0 M`.
 * Sous 100 000, la planche ne montre rien : le montant passe en milliers (`61000` -> `61 k`) pour ne pas écrire « 0,0 M ».
 */
export function millions(fcfa: number): string {
  const absolu = Math.abs(fcfa);
  const signe = fcfa < 0 ? "− " : "";
  if (absolu >= 100_000) return `${signe}${decimale(Math.round(absolu / 100_000) / 10)} M`;
  if (absolu >= 1000) return `${signe}${Math.round(absolu / 1000)} k`;
  return `${signe}${Math.round(absolu)}`;
}

/** Net d'un bus, avec son signe : `2800000` -> `+ 2,8 M`, `-300000` -> `− 0,3 M`, `0` -> `0`. */
export function net(fcfa: number): string {
  if (fcfa === 0) return "0";
  return fcfa > 0 ? `+ ${millions(fcfa)}` : millions(fcfa);
}

/** Variation face à la période précédente : `5` -> `+ 5 %`, `-3` -> `− 3 %`, `0,5` -> `+ 0,5 %`, `0` -> `0 %`. */
export function variation(pourcent: number): string {
  if (pourcent === 0) return "0 %";
  const valeur = String(Math.abs(pourcent)).replace(".", ",");
  return `${pourcent < 0 ? "−" : "+"} ${valeur} %`;
}

/** Remplissage d'une ligne : `91` -> `91 %`. */
export function taux(pourcent: number): string {
  return `${String(Math.round(pourcent * 10) / 10).replace(".", ",")} %`;
}

/** Ce que la ligne « Colis » affiche à droite : `2104`, `2100000` -> `2 104 · 2,1 M`. */
export function colisEtRecette(colis: Analyses["colis"]): string {
  return `${groupes(colis.nombre)} · ${millions(colis.recette)}`;
}
