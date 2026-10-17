import { aammjjDouala, ajouterJours, enMs, versIsoDouala, type Instant } from "../colis/temps";

/**
 * Heures de Douala (UTC+01:00, sans heure d'été) dont les points relais et les livreurs ont besoin
 * en plus de celles du module colis : minutes, jour de la semaine, début de jour et de semaine.
 */

export { aammjjDouala, ajouterJours, enMs, versIsoDouala };
export type { Instant };

const MS_PAR_MINUTE = 60_000;
const MS_PAR_JOUR = 24 * 60 * MS_PAR_MINUTE;
const DECALAGE_MS = 60 * MS_PAR_MINUTE;

export function ajouterMinutes(instant: Instant, minutes: number): string {
  return versIsoDouala(enMs(instant) + minutes * MS_PAR_MINUTE);
}

export function ajouterHeures(instant: Instant, heures: number): string {
  return ajouterMinutes(instant, heures * 60);
}

export function ajouterSecondes(instant: Instant, secondes: number): string {
  return versIsoDouala(enMs(instant) + secondes * 1000);
}

/** Minutes écoulées depuis minuit, à Douala (0 à 1 439). */
export function minutesDuJour(instant: Instant): number {
  const local = enMs(instant) + DECALAGE_MS;
  return Math.floor((((local % MS_PAR_JOUR) + MS_PAR_JOUR) % MS_PAR_JOUR) / MS_PAR_MINUTE);
}

/** 0 dimanche, 1 lundi … 6 samedi, à Douala. */
export function jourSemaine(instant: Instant): number {
  return new Date(enMs(instant) + DECALAGE_MS).getUTCDay();
}

/** Minuit (Douala) du jour de `instant`. */
export function debutDeJour(instant: Instant): string {
  const local = enMs(instant) + DECALAGE_MS;
  return versIsoDouala(Math.floor(local / MS_PAR_JOUR) * MS_PAR_JOUR - DECALAGE_MS);
}

/** Lundi 00:00 (Douala) de la semaine de `instant`. */
export function debutDeSemaine(instant: Instant): string {
  const depuisLundi = (jourSemaine(instant) + 6) % 7; // jours écoulés depuis lundi
  return versIsoDouala(enMs(debutDeJour(instant)) - depuisLundi * MS_PAR_JOUR);
}

/** Le même jour que `instant`, à `minutes` minutes après minuit (Douala). */
export function aMinutesDuJour(instant: Instant, minutes: number): string {
  return versIsoDouala(enMs(debutDeJour(instant)) + minutes * MS_PAR_MINUTE);
}

/** Jours entiers écoulés entre deux instants (arrondis à l'inférieur, jamais négatifs). */
export function joursEcoules(depuis: Instant, jusqua: Instant): number {
  return Math.max(0, Math.floor((enMs(jusqua) - enMs(depuis)) / MS_PAR_JOUR));
}

/** « 14:05 » : l'heure de Douala d'un instant, comme dans les messages. */
export function heureCourte(instant: Instant): string {
  const m = minutesDuJour(instant);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
