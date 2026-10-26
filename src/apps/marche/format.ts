// Formats communs des écrans du marché : dates courtes en français (déterministes, sans dépendre des données de langue du navigateur), pluriels, heure.
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const NBSP = ' ';
const p2 = (n: number): string => String(n).padStart(2, '0');
/** « 13 oct. » */
export const jourCourt = (ms: number): string => { const d = new Date(ms); return `${d.getDate()}${NBSP}${MOIS[d.getMonth()]}`; };
/** « ven. 18 déc. » */
export const jourSemaine = (ms: number): string => { const d = new Date(ms); return `${JOURS[d.getDay()]} ${d.getDate()}${NBSP}${MOIS[d.getMonth()]}`; };
/** « lun. 14 déc. 2026 » */
export const jourComplet = (ms: number): string => `${jourSemaine(ms)} ${new Date(ms).getFullYear()}`;
/** « 16:42 » */
export const heure = (ms: number): string => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** « 17 déc. à 18:05 » */
export const jourHeure = (ms: number): string => `${jourCourt(ms)} à ${heure(ms)}`;
/** « 15–28 févr. 2027 » ou « 28 févr. – 3 mars 2027 » (jours `YYYY-MM-DD`). */
export function fenetreJours(du: string, au: string): string {
  const a = new Date(`${du}T12:00`), b = new Date(`${au}T12:00`), an = b.getFullYear();
  if (du === au) return `${b.getDate()}${NBSP}${MOIS[b.getMonth()]} ${an}`;
  return a.getMonth() === b.getMonth() && a.getFullYear() === an ? `${a.getDate()}–${b.getDate()}${NBSP}${MOIS[b.getMonth()]} ${an}` : `${a.getDate()}${NBSP}${MOIS[a.getMonth()]} – ${b.getDate()}${NBSP}${MOIS[b.getMonth()]} ${an}`;
}
export const pluriel = (n: number, un: string, plusieurs = `${un}s`): string => (n > 1 ? plusieurs : un);
/** « 1 jour » / « 6 jours » */
export const jours = (n: number): string => `${n} ${pluriel(n, 'jour')}`;
