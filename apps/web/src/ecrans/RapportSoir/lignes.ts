import type { RapportGare } from "./types";

/**
 * Les remarques d'une gare (« 3 guichets clôturés », « guichet 2, validé par Essono », « 1 départ fusionné (16:00 +
 * 16:30) », « soute pleine à 10:00 ») sont écrites par l'API, qui est aussi la source du message WhatsApp. La planche
 * les range ainsi autour de l'écart de la gare :
 *
 *   Akwa · 491 billets · 3 guichets clôturés · écart − 1 000 (guichet 2, validé par Essono)
 *   Mvan · 338 billets · écart 0 · 1 départ fusionné (16:00 + 16:30)
 *
 * - avant l'écart : le décompte des guichets clôturés ;
 * - entre parenthèses, après l'écart : ce qui concerne un guichet précis (« guichet 2, … ») ;
 * - après l'écart, séparées par « · » : toutes les autres (départ fusionné, soute pleine, trous de numérotation…).
 */
export interface RemarquesRangees {
  avant: string[];
  entreParentheses: string[];
  apres: string[];
}

const DECOMPTE_GUICHETS = /^\d+ guichets? clôturés?( sur \d+)?$/;
const REMARQUE_DE_GUICHET = /^guichet \d+, /;

export function ranger(remarques: RapportGare["remarques"]): RemarquesRangees {
  const rangees: RemarquesRangees = { avant: [], entreParentheses: [], apres: [] };
  for (const brute of remarques) {
    const remarque = brute.trim();
    if (remarque === "") continue;
    if (DECOMPTE_GUICHETS.test(remarque)) rangees.avant.push(remarque);
    else if (REMARQUE_DE_GUICHET.test(remarque)) rangees.entreParentheses.push(remarque);
    else rangees.apres.push(remarque);
  }
  return rangees;
}
