// Conversions entre l'unité affichée (minutes, dollars, km, kg) et l'unité de base stockée (spec §4).
import type { TypeMetrique } from '@core/types.ts';

const FACTEUR: Partial<Record<TypeMetrique, number>> = { temps: 60, montant: 100, distance: 1000, poids: 1000 };

/** Valeur de base → valeur affichée (secondes → minutes, centimes → dollars…). */
export const versAffichage = (type: TypeMetrique, v: number) => v / (FACTEUR[type] ?? 1);

/** Texte tapé (« 1,5 », « 45 ») → valeur de base, ou null s'il n'est pas un nombre positif. */
export function depuisAffichage(type: TypeMetrique, texte: string): number | null {
  const n = Number(texte.replace(/\s/g, '').replace(',', '.'));
  if (!texte.trim() || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * (FACTEUR[type] ?? 1) * 1000) / 1000;
}

/** Unité affichée à côté d'un champ de saisie directe. */
export const uniteAffichee = (type: TypeMetrique, unite: string) => (type === 'temps' ? 'min' : type === 'montant' ? '$' : type === 'distance' ? 'km' : type === 'poids' ? 'kg' : unite);
