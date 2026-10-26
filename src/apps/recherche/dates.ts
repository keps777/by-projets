// Dates et durées de la recherche : jours `YYYY-MM-DD`, libellés français des maquettes (« ven. 18 déc. », « Vendredi 18 décembre 2026 », « 7 h 05 »).
// Fonctions pures, sans dépendance au magasin : les jours sont traités en UTC pour ne jamais dépendre du fuseau.
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const JOURS_LONGS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const NBSP = '\u00a0';

const RE_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Un jour `YYYY-MM-DD` qui existe vraiment au calendrier (pas de 31 février). */
export function jourValide(s: string | null | undefined): s is string {
  const m = RE_JOUR.exec(s ?? ''); if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])], t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}
const p2 = (n: number) => String(n).padStart(2, '0');
const parties = (jour: string) => { const [y, m, d] = jour.split('-').map(Number); return { y, m, d }; };
export const enJour = (t: Date): string => `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
export const deJour = (jour: string): Date => { const { y, m, d } = parties(jour); return new Date(Date.UTC(y, m - 1, d)); };
export const ajouterJours = (jour: string, n: number): string => { const t = deJour(jour); t.setUTCDate(t.getUTCDate() + n); return enJour(t); };
/** Nombre de jours de `a` à `b` (positif si `b` est après `a`). */
export const ecartJours = (a: string, b: string): number => Math.round((deJour(b).getTime() - deJour(a).getTime()) / 86_400_000);
export const jourDeSemaine = (jour: string): number => deJour(jour).getUTCDay();

/** « ven. 18 déc. » */
export function fmtJourCourt(jour: string): string { const { m, d } = parties(jour); return `${JOURS[jourDeSemaine(jour)]} ${d} ${MOIS[m - 1]}`; }
/** « ven. 18 déc. 2026 » */
export function fmtJourAnnee(jour: string): string { return `${fmtJourCourt(jour)} ${parties(jour).y}`; }
/** « Vendredi 18 décembre 2026 » */
export function fmtJourLong(jour: string): string { const { y, m, d } = parties(jour); return `${JOURS_LONGS[jourDeSemaine(jour)]} ${d} ${MOIS_LONGS[m - 1]} ${y}`; }
/** « févr. 2027 » */
export function fmtMoisAnnee(jour: string): string { const { y, m } = parties(jour); return `${MOIS[m - 1]} ${y}`; }
/** « décembre 2026 » (titre du calendrier) */
export function fmtMoisLong(annee: number, mois: number): string { return `${MOIS_LONGS[mois - 1]} ${annee}`; }
/** « juil. » : mois abrégé d'un jour. */
export const moisCourt = (jour: string): string => MOIS[parties(jour).m - 1];
export const moisLong = (jour: string): string => MOIS_LONGS[parties(jour).m - 1];
/** « 7 h 05 » à partir de minutes. */
export function fmtDuree(min: number): string { const h = Math.floor(min / 60), m = min % 60; return `${h}${NBSP}h${NBSP}${p2(m)}`; }
/** « Direct » / « 1 escale · KEF » / « 2 escales · KEF, LAX ». */
export function fmtEscales(escales: string[]): string { return escales.length ? `${escales.length}${NBSP}escale${escales.length > 1 ? 's' : ''} · ${escales.join(', ')}` : 'Direct'; }
/** « 2 voyageurs » / « 1 voyageur ». */
export const fmtVoyageurs = (n: number): string => `${n}${NBSP}voyageur${n > 1 ? 's' : ''}`;
/** « 2 adultes » / « 1 adulte » (sélecteur de la recherche). */
export const fmtAdultes = (n: number): string => `${n}${NBSP}adulte${n > 1 ? 's' : ''}`;
/** « jeu. 17 déc. 18:05 » : un instant (ms), heure locale. */
export function fmtInstant(ms: number): string {
  const t = new Date(ms), jour = `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`;
  return `${fmtJourCourt(jour)} ${p2(t.getHours())}:${p2(t.getMinutes())}`;
}
/** « 17 déc. 18:05 » : un instant sans le jour de la semaine (phrase « avant le … »). */
export function fmtInstantCourt(ms: number): string { const t = new Date(ms); return `${t.getDate()} ${MOIS[t.getMonth()]} ${p2(t.getHours())}:${p2(t.getMinutes())}`; }
/** Premier jour d'un mois (`YYYY-MM-01`), et décalage de mois entiers pour la navigation du calendrier. */
export function decalerMois(annee: number, mois: number, delta: number): { annee: number; mois: number } {
  const t = new Date(Date.UTC(annee, mois - 1 + delta, 1)); return { annee: t.getUTCFullYear(), mois: t.getUTCMonth() + 1 };
}
/** Les cases d'un mois, par semaines (lundi en premier) : `null` hors du mois. Toujours un nombre entier de semaines. */
export function semainesDuMois(annee: number, mois: number): (string | null)[][] {
  const premier = `${annee}-${p2(mois)}-01`, decal = (jourDeSemaine(premier) + 6) % 7, nb = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const cases: (string | null)[] = [...Array(decal).fill(null), ...Array.from({ length: nb }, (_, i) => `${annee}-${p2(mois)}-${p2(i + 1)}`)];
  while (cases.length % 7) cases.push(null);
  return Array.from({ length: cases.length / 7 }, (_, i) => cases.slice(i * 7, i * 7 + 7));
}
