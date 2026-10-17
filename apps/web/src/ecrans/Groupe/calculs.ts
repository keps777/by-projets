import type { voyageur as contrats } from "@afrimove/contrats";

/** « 21000 » -> « 21 000 » (espaces ordinaires, comme dans la planche). */
export function formaterMontant(montant: number): string {
  return String(Math.abs(Math.trunc(montant))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « 2027-01-10T07:30:00.000+01:00 » -> « 07:30 » (les heures du contrat sont déjà à l'heure de Douala). */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."] as const;
const MOIS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

/** « 2027-01-10T07:30:00.000+01:00 » -> « dim. 10 janv. » (le jour calendaire de Douala, sans fuseau du navigateur). */
export function jourCourt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const semaine = new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay();
  const nomMois = MOIS[mois - 1];
  return nomMois === undefined ? "" : `${JOURS[semaine]} ${jour} ${nomMois}`;
}

/** « Alpha Voyages » -> « Alpha » : la planche écrit le nom court de la compagnie à côté de l'heure. */
export function nomCourt(compagnie: string): string {
  return compagnie.replace(/\s+Voyages$/i, "");
}

/** Premier et dernier siège réservés (« 11 à 17 »), `null` si aucun siège. */
export function plageSieges(
  sieges: readonly number[],
): { premier: number; dernier: number } | null {
  if (sieges.length === 0) return null;
  return { premier: Math.min(...sieges), dernier: Math.max(...sieges) };
}

/** Minutes qui restent avant la fin du blocage des sièges, arrondies à la minute supérieure, jamais négatives. */
export function minutesRestantes(blocageJusqua: string, maintenant: Date): number {
  const fin = new Date(blocageJusqua).getTime();
  if (Number.isNaN(fin)) return 0;
  return Math.max(0, Math.ceil((fin - maintenant.getTime()) / 60_000));
}

/**
 * Le participant qui est moi. Avec le profil, c'est celui qui a mon identifiant ; sans profil (hors ligne, scénario
 * sans profil), le seul repère est le compte : un participant sans identifiant est un invité sans compte.
 */
export function estMoi(
  participant: contrats.ParticipantGroupe,
  monId: string | undefined,
): boolean {
  if (participant.id === undefined) return false;
  return monId === undefined ? true : participant.id === monId;
}

/** Lien WhatsApp qui ouvre le partage d'un texte (le lien de la cagnotte y est inclus). */
export function lienWhatsApp(texte: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texte)}`;
}

/** Teintes des pastilles d'initiales, dans l'ordre des lignes de « Qui paie quoi ». */
export const TEINTES_PASTILLES = ["ambre", "bleu", "rouge"] as const;
export type TeintePastille = (typeof TEINTES_PASTILLES)[number];

export function teinteDe(rang: number): TeintePastille {
  return TEINTES_PASTILLES[rang % TEINTES_PASTILLES.length] ?? "ambre";
}

/** Sièges à payer : le premier pour ma part, tous pour le groupe. */
export function siegesAPayer(sieges: readonly number[], tout: boolean): number[] {
  return tout ? [...sieges] : sieges.slice(0, 1);
}
