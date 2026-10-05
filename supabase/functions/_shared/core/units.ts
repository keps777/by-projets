// Unités de base et formats d'affichage (spec §4). Tout est stocké en entiers/unités de base exactes.

const nf = (digits: number) => new Intl.NumberFormat('fr-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Nombre décimal à la française, sans zéros inutiles : 3 → « 3 », 8.4 → « 8,4 ». */
export function nombre(n: number, maxDecimales = 1): string {
  const r = Math.round(n * 10 ** maxDecimales) / 10 ** maxDecimales;
  return new Intl.NumberFormat('fr-CA', { maximumFractionDigits: maxDecimales }).format(r);
}

/** Secondes → « 2h15 », « 0h28 ». `approx` ajoute le « ~ ». */
export function formatTemps(secondes: number, approx = false): string {
  let min = Math.round(Math.max(0, secondes) / 60);
  const h = Math.floor(min / 60);
  min -= h * 60;
  return `${approx ? '~' : ''}${h}h${String(min).padStart(2, '0')}`;
}

/** Secondes → « 2 h 15 » / « 45 min » (lecture dans l'interface). */
export function dureeLisible(secondes: number): string {
  const min = Math.round(Math.max(0, secondes) / 60);
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h === 0) return `${r} min`;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

/** Centimes → « 1 380,00 $ » (espace insécable de fr-CA). */
export function formatMontant(centimes: number, devise = 'CAD'): string {
  const signe = centimes < 0 ? '−' : '';
  const v = Math.abs(centimes) / 100;
  const sym = devise === 'CAD' || devise === 'USD' ? '$' : devise === 'EUR' ? '€' : devise;
  return `${signe}${nf(2).format(v)} ${sym}`;
}

/** Centimes → « 50 $ » quand c'est rond, sinon « 68,40 $ ». */
export function formatMontantCourt(centimes: number, devise = 'CAD'): string {
  return centimes % 100 === 0 ? formatMontant(centimes, devise).replace(/,00(?=\s)/, '') : formatMontant(centimes, devise);
}

export const dollarsVersCentimes = (d: number) => Math.round(d * 100);
export const minutesVersSecondes = (m: number) => Math.round(m * 60);
export const kmVersMetres = (km: number) => Math.round(km * 1000);
export const kgVersGrammes = (kg: number) => Math.round(kg * 1000);

export function formatDistance(metres: number): string { return `${nombre(metres / 1000, 1)} km`; }
export function formatPoids(grammes: number): string { return `${nombre(grammes / 1000, 1)} kg`; }

/** Minutes depuis minuit → « 05:10 ». */
export function formatHeure(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** « 05:10 » → minutes depuis minuit. */
export function parseHeure(texte: string): number | null {
  const m = /^(\d{1,2})[:h](\d{2})$/.exec(texte.trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}
