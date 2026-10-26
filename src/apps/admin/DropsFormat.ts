// Formats d'affichage de la console d'administration : dates et heures de Montréal (heure locale du navigateur) avec le décalage UTC.
const p2 = (n: number): string => String(n).padStart(2, '0');
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'], JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
/** « UTC−4 » : décalage de l'heure locale à l'instant `ms` (heure d'été ou d'hiver). */
export function decalage(ms: number): string { const o = -new Date(ms).getTimezoneOffset() / 60; return `UTC${o < 0 ? '−' : '+'}${Math.abs(o)}`; }
/** « 14:02 » en heure locale. */
export const heure = (ms: number): string => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** « 14:01:00 » en heure locale. */
export const heureSec = (ms: number): string => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
/** « 18:01:00 » en UTC. */
export const heureUtc = (ms: number): string => { const d = new Date(ms); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`; };
/** « 12 oct. 2026 ». */
export const jour = (ms: number): string => { const d = new Date(ms); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
/** « lun. 12 oct. 2026 ». */
export const jourSemaine = (ms: number): string => `${JOURS[new Date(ms).getDay()]} ${jour(ms)}`;
/** « 12 oct. 2026 à 14:02 (UTC−4) ». */
export const jourHeure = (ms: number): string => `${jour(ms)} à ${heure(ms)} (${decalage(ms)})`;
/** Compte à rebours « 04:31 » ou « 2:04:31 » (0 si l'échéance est passée). */
export function compteARebours(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${p2(m)}:${p2(s % 60)}` : `${p2(m)}:${p2(s % 60)}`;
}
/** Lit « AAAA-MM-JJ » et « HH:MM » (heure locale) ; `NaN` si le format ou la date est invalide. */
export function lireInstant(jourTxt: string, heureTxt: string): number {
  const j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jourTxt.trim()), h = /^(\d{1,2}):(\d{2})$/.exec(heureTxt.trim()); if (!j || !h) return NaN;
  const [a, m, d, hh, mm] = [+j[1], +j[2], +j[3], +h[1], +h[2]]; if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return NaN;
  const t = new Date(a, m - 1, d, hh, mm); return t.getMonth() === m - 1 && t.getDate() === d ? t.getTime() : NaN;
}
