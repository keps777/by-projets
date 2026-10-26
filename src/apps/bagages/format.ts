// Formats de dates en français canadien, partagés par les écrans « bagages » et « intentions ». Fonctions pures.
const midi = (jour: string): Date => new Date(`${jour}T12:00`);
const fr = (jour: string, o: Intl.DateTimeFormatOptions): string => midi(jour).toLocaleDateString('fr-CA', o);
const p2 = (n: number): string => String(n).padStart(2, '0');

/** « lun. 14 déc. » */
export const jourCourt = (jour: string): string => fr(jour, { weekday: 'short', day: 'numeric', month: 'short' });
/** « 14 déc. » */
export const jourMois = (jour: string): string => fr(jour, { day: 'numeric', month: 'short' });
/** « 14 déc. 2026 » */
export const jourMoisAn = (jour: string): string => fr(jour, { day: 'numeric', month: 'short', year: 'numeric' });
/** « Vendredi 18 décembre 2026 » */
export const jourLong = (jour: string): string => { const s = fr(jour, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
/** « ven. 18 déc. » depuis un instant (ms). */
export const instantJourCourt = (ms: number): string => new Date(ms).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
/** « 12 oct. » depuis un instant. */
export const instantJourMois = (ms: number): string => new Date(ms).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
/** « 21 nov. 2026 » depuis un instant. */
export const instantJourMoisAn = (ms: number): string => new Date(ms).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
/** « 18:42 » depuis un instant. */
export const heure = (ms: number): string => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** « 15–20 déc. 2026 » (ou « 28 nov. – 3 déc. 2026 » si les mois diffèrent). */
export function fenetre(du: string, au: string): string {
  const a = midi(du), b = midi(au), an = b.toLocaleDateString('fr-CA', { year: 'numeric' });
  const mois = (d: Date) => d.toLocaleDateString('fr-CA', { month: 'short' });
  if (du === au) return `${a.getDate()} ${mois(a)} ${an}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${mois(b)} ${an}`;
  return `${a.getDate()} ${mois(a)} – ${b.getDate()} ${mois(b)} ${an}`;
}
/** Le jour `YYYY-MM-DD` décalé de `n` jours. */
export function decaler(jour: string, n: number): string { const d = midi(jour); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
/** Heure d'arrivée affichée, « 07:10 » et le décalage « +1 ». */
export const dureeLibelle = (min: number): string => `${Math.floor(min / 60)} h ${p2(min % 60)}`;
/** Pluriel simple : `pluriel(2, 'bagage')` → « 2 bagages ». */
export const pluriel = (n: number, mot: string, mots = `${mot}s`): string => `${n} ${n > 1 ? mots : mot}`;
/** « 12,5 % » / « 10 % » (espace insécable) depuis un taux (0,125). */
export const pourcent = (taux: number): string => `${String(Math.round(taux * 1000) / 10).replace('.', ',')}\u00A0%`;
