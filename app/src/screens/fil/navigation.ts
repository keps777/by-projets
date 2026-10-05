// Lecture sûre des paramètres de recherche des écrans du Fil.
import type { Jour, Mois } from '@core/types.ts';

/** « AAAA-MM-JJ » valide, sinon null. */
export function jourValide(v: string | null | undefined): Jour | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [a, m, j] = v.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j ? v : null;
}

/** « AAAA-MM » valide, sinon null. */
export function moisValide(v: string | null | undefined): Mois | null {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return null;
  const m = +v.slice(5);
  return m >= 1 && m <= 12 ? v : null;
}
