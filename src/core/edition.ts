/** Édition de l'application, fixée à la construction (variable `VITE_EDITION`) :
 *  - `agence` : l'orbe propose le carrousel de tous les personnages (agent de gare, patron, chauffeur, point relais…) ;
 *  - `particulier` : application grand public, seul le parcours voyageur reste visible.
 *  Par défaut (démonstration), l'édition est `agence`. */
export type Edition = 'agence' | 'particulier';
export function edition(valeur: string | undefined = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_EDITION): Edition {
  return valeur === 'particulier' ? 'particulier' : 'agence';
}
export const personnagesVisibles = (valeur?: string): boolean => edition(valeur) === 'agence';
