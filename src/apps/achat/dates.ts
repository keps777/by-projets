// Dates et heures en français pour les écrans d'achat et de préparation : « ven. 18 déc. », « 17 déc. 18:05 », « 14 décembre ».
// Fonctions pures, indépendantes de la langue du navigateur (les maquettes fixent le texte). Les instants sont en heure locale (celle de Montréal dans la démo).
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** « 18:05 ». */
export const heure = (ms: number): string => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** « 18 déc. » */
export const jourMois = (ms: number): string => { const d = new Date(ms); return `${d.getDate()} ${MOIS[d.getMonth()]}`; };
/** « ven. 18 déc. » */
export const jourCourt = (ms: number): string => { const d = new Date(ms); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
/** « ven. 18 déc. 2026 » */
export const jourComplet = (ms: number): string => `${jourCourt(ms)} ${new Date(ms).getFullYear()}`;
/** « 17 déc. 18:05 » */
export const jourMoisHeure = (ms: number): string => `${jourMois(ms)} ${heure(ms)}`;
/** « 17 déc. à 18:05 » */
export const jourMoisAHeure = (ms: number): string => `${jourMois(ms)} à ${heure(ms)}`;
/** « 14 déc. 2026 » */
export const jourMoisAnnee = (ms: number): string => `${jourMois(ms)} ${new Date(ms).getFullYear()}`;
/** « 12 janv. » ; avec l'année (« 12 janv. 2025 ») si elle diffère de celle de `reference`. */
export const jourMoisSiAnnee = (ms: number, reference: number): string => (new Date(ms).getFullYear() === new Date(reference).getFullYear() ? jourMois(ms) : jourMoisAnnee(ms));
/** « décembre » */
export const moisLong = (ms: number): string => MOIS_LONGS[new Date(ms).getMonth()];
/** « Lun. 14 déc. 2026 » (première lettre en capitale, comme sur la planche de finalisation). */
export const jourCompletCapitale = (ms: number): string => { const s = jourComplet(ms); return s.charAt(0).toUpperCase() + s.slice(1); };
/** Instant d'un jour `YYYY-MM-DD` décalé de `n` jours, à une heure `HH:mm` (heure locale). */
export function instantDuJour(jour: string, hhmm: string, plusJours = 0): number {
  const [h, m] = hhmm.split(':').map(Number); const d = new Date(`${jour}T12:00`); d.setDate(d.getDate() + plusJours); d.setHours(h, m, 0, 0); return d.getTime();
}
/** Durée « 7 h 05 » à partir de minutes. */
export const dureeVol = (min: number): string => `${Math.floor(min / 60)} h ${p2(min % 60)}`;
/** Initiales en capitales, « Alex Tremblay » → « AT ». */
export const initiales = (prenom: string, nom: string): string => `${prenom.trim()[0] ?? ''}${nom.trim()[0] ?? ''}`.toUpperCase();
/** « Alex T. » : prénom et initiale du nom. */
export const nomCourt = (prenom: string, nom: string): string => `${prenom.trim()}${nom.trim() ? ` ${nom.trim()[0].toUpperCase()}.` : ''}`.trim();
