// Montants et pourcentages de la recherche, avec espaces insécables (« 1 500 $ », « −27 % ») : un prix ne se coupe jamais en fin de ligne.
import { fmt, fmtPct } from '../../core/argent.ts';
/** Remplace les espaces ordinaires par des espaces insécables. */
export const nbsp = (s: string): string => s.replace(/ /g, ' ');
/** « 1 500 $ » avec espaces insécables. */
export const dollars = (x: number): string => nbsp(fmt(x));
/** Écart arrondi à l'entier, toujours signé (« −27 % », « +4 % ») : le texte de la maquette, sans décimale. */
export const fmtEcart = (pct: number): string => nbsp(fmtPct(Math.round(pct)));
