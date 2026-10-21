import { aammjjDouala, ajouterJours, enMs, versIsoDouala, type Instant } from "../colis/temps";

/**
 * Heures de Douala (UTC+01:00, sans heure d'été) dont les règlements entre compagnies ont besoin en
 * plus de celles du module colis : minutes, jour de la semaine, début de jour et de semaine.
 */

export { aammjjDouala, ajouterJours, enMs, versIsoDouala };
export type { Instant };

const MS_PAR_MINUTE = 60_000;
const MS_PAR_HEURE = 60 * MS_PAR_MINUTE;
const MS_PAR_JOUR = 24 * MS_PAR_HEURE;
const DECALAGE_MS = MS_PAR_HEURE;

export function ajouterMinutes(instant: Instant, minutes: number): string {
  return versIsoDouala(enMs(instant) + minutes * MS_PAR_MINUTE);
}

export function ajouterHeures(instant: Instant, heures: number): string {
  return versIsoDouala(enMs(instant) + heures * MS_PAR_HEURE);
}

/** Minutes entières entre deux instants (négatif si `b` est avant `a`). */
export function minutesEntre(a: Instant, b: Instant): number {
  return Math.round((enMs(b) - enMs(a)) / MS_PAR_MINUTE);
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
  const depuisLundi = (jourSemaine(instant) + 6) % 7;
  return versIsoDouala(enMs(debutDeJour(instant)) - depuisLundi * MS_PAR_JOUR);
}

/** `AAAA-MM-JJ` du jour de Douala. */
export function jourDouala(instant: Instant): string {
  return versIsoDouala(instant).slice(0, 10);
}

/** Le trimestre civil de l'instant (1 à 4) et son année, à Douala. */
export function trimestreDe(instant: Instant): { annee: number; numero: number } {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return { annee: d.getUTCFullYear(), numero: Math.floor(d.getUTCMonth() / 3) + 1 };
}

/** `08:15` : l'heure de Douala d'un instant. */
export function heureCourte(instant: Instant): string {
  return versIsoDouala(instant).slice(11, 16);
}
