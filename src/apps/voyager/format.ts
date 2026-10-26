// Formats français de l'accueil et des reventes : dates sans dépendre des réglages régionaux du navigateur, comptes à rebours, durées.
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const p2 = (n: number) => String(n).padStart(2, '0');
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « lundi 12 octobre » (date du jour dans l'en-tête de l'accueil). */
export const jourLong = (ms: number): string => { const d = new Date(ms); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
/** « 13 déc. » */
export const jourCourt = (ms: number): string => { const d = new Date(ms); return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`; };
/** « lun. 14 déc. » ; `avecAnnee` : « lun. 14 déc. 2026 » ; `maj` : « Lun. 14 déc. 2026 ». */
export function jourSemaine(ms: number, { avecAnnee = false, maj = false }: { avecAnnee?: boolean; maj?: boolean } = {}): string {
  const d = new Date(ms), s = `${JOURS_COURTS[d.getDay()]} ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}${avecAnnee ? ` ${d.getFullYear()}` : ''}`;
  return maj ? majuscule(s) : s;
}
/** « 18:05 » (heure locale). */
export const heureDe = (ms: number): string => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
/** « 7 h 05 » à partir de minutes ; « 7 h » si pile. */
export function dureeHM(min: number): string { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h} h ${p2(m)}` : `${h} h`; }
/** Durée de vol approximative du radar, en heures décimales : « 6 h 30 », « 4 h 48 », « 7 h ». */
export function dureeHeures(h: number): string { return dureeHM(Math.round(h * 60)); }
/** Compte à rebours long : « 5 j 01:59:59 » (jours seulement s'il en reste). */
export function decompte(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000)), j = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${j > 0 ? `${j} j ` : ''}${p2(h)}:${p2(m)}:${p2(s)}`;
}
/** Compte à rebours d'un drop : « 00:04:31 » (heures cumulées, jamais de jours). */
export function horlogeDrop(ms: number): string { const t = Math.max(0, Math.floor(ms / 1000)); return `${p2(Math.floor(t / 3600))}:${p2(Math.floor((t % 3600) / 60))}:${p2(t % 60)}`; }
/** « Départ dans 3 jours » / « Départ demain » / « Départ aujourd'hui ». */
export function departDans(jours: number): string { return jours <= 0 ? 'Départ aujourd’hui' : jours === 1 ? 'Départ demain' : `Départ dans ${jours} jours`; }
/** « Dans 63 jours » / « Demain » / « Aujourd'hui ». */
export function dansJours(jours: number): string { return jours <= 0 ? 'Aujourd’hui' : jours === 1 ? 'Demain' : `Dans ${jours} jours`; }
/** Pluriel simple : « 1 destination », « 3 destinations ». */
export const nombreDe = (n: number, singulier: string, pluriel = `${singulier}s`): string => `${n} ${n > 1 ? pluriel : singulier}`;
/** Remplace les espaces par des insécables : un montant ou un pourcentage ne se coupe jamais en fin de ligne (« 1 300 $ », « −28,1 % »). */
export const nb = (s: string): string => s.replace(/ /g, ' ');
