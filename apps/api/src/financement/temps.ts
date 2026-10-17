import { aammjjDouala, ajouterJours, enMs, versIsoDouala, type Instant } from "../colis/temps";

/**
 * Heures de Douala (UTC+01:00, sans heure d'été) dont le financement a besoin, en plus de celles du
 * module colis : heures, minutes, début de jour, année, mois.
 */

export { aammjjDouala, ajouterJours, enMs, versIsoDouala };
export type { Instant };

const MS_PAR_MINUTE = 60_000;
const MS_PAR_HEURE = 60 * MS_PAR_MINUTE;
const MS_PAR_JOUR = 24 * MS_PAR_HEURE;
const DECALAGE_MS = MS_PAR_HEURE;

const p2 = (n: number): string => String(n).padStart(2, "0");

export function ajouterHeures(instant: Instant, heures: number): string {
  return versIsoDouala(enMs(instant) + heures * MS_PAR_HEURE);
}

/** Minuit (Douala) du jour de `instant`, en millisecondes. */
function minuit(instant: Instant): number {
  const local = enMs(instant) + DECALAGE_MS;
  return Math.floor(local / MS_PAR_JOUR) * MS_PAR_JOUR - DECALAGE_MS;
}

/** Jours calendaires (Douala) entre deux instants : 0 le même jour, 1 le lendemain, -1 la veille. */
export function ecartDeJours(depuis: Instant, jusqua: Instant): number {
  return Math.round((minuit(jusqua) - minuit(depuis)) / MS_PAR_JOUR);
}

/** « 10:04 » : l'heure de Douala d'un instant. */
export function heureCourte(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** Année civile à Douala (2027). */
export function anneeDouala(instant: Instant): number {
  return new Date(enMs(instant) + DECALAGE_MS).getUTCFullYear();
}

/** Mois comptable `AAAA-MM` à Douala. */
export function moisDouala(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`;
}

/** Le mois qui précède `mois` (`2027-01` donne `2026-12`). */
export function moisPrecedent(mois: string): string {
  const [a, m] = mois.split("-").map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${p2(m - 1)}`;
}

const MOIS_COURTS = [
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

/** « 12 janv. » : le jour et le mois courts, à Douala. */
export function jourCourt(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return `${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`;
}
