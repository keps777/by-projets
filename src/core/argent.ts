// Montants en dollars canadiens : formatage « 1 480 $ » / « 1 152,00 $ », arrondi au cent, écarts toujours signés (jamais la couleur seule).
const NBSP = ' ';
export const arrondi = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
/** « 1 480 $ » ; avec centimes si le montant n'est pas entier ou si `centimes` est vrai (« 1 152,00 $ »). */
export function fmt(x: number, { centimes = false }: { centimes?: boolean } = {}): string {
  const v = arrondi(x), neg = v < 0, a = Math.abs(v);
  const [ent, dec] = a.toFixed(2).split('.');
  const groupe = ent.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const avecDec = centimes || dec !== '00';
  return `${neg ? '−' : ''}${groupe}${avecDec ? `,${dec}` : ''}${NBSP}$`;
}
/** « +1 680 $ » / « −550 $ » / « 0 $ » (signe typographique). */
export function fmtSigne(x: number, opts?: { centimes?: boolean }): string { const v = arrondi(x); return `${v > 0 ? '+' : v < 0 ? '' : ''}${fmt(v, opts)}`; }
export interface Ecart { abs: number; pct: number; sens: 'hausse' | 'baisse' | 'stable' }
/** Écart entre un prix de référence (payé) et un prix courant (équivalent) : valeur absolue, pourcentage, sens. */
export function ecart(reference: number, courant: number): Ecart {
  const abs = arrondi(courant - reference), pct = reference ? Math.round((abs / reference) * 1000) / 10 : 0;
  return { abs, pct, sens: abs > 0 ? 'hausse' : abs < 0 ? 'baisse' : 'stable' };
}
/** « +100 % » / « −3 % » / « 0 % » ; une décimale seulement si elle est utile (« −26,8 % »). */
export function fmtPct(pct: number): string {
  const r = Math.round(pct * 10) / 10, s = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(1).replace('.', ',');
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${s}${NBSP}%`;
}
export const flecheEcart = (e: Ecart): string => (e.sens === 'hausse' ? '▲' : e.sens === 'baisse' ? '▼' : '■');
