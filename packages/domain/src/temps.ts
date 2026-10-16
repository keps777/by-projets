/**
 * Heures : toutes les dates exposées par le domaine sont des chaînes ISO 8601 exprimées dans le
 * fuseau Africa/Douala (WAT, UTC+01:00, sans heure d'été), par exemple `2027-01-05T05:30:00.000+01:00`.
 * Le décalage est fixe : on n'a donc pas besoin d'Intl ni de base de fuseaux pour être déterministe.
 */
export const FUSEAU = "Africa/Douala";
export const DECALAGE_MINUTES = 60;
export const SUFFIXE_DECALAGE = "+01:00";

/** Chaîne ISO avec décalage +01:00. */
export type IsoDouala = string;
export type Instant = Date | number | string;

const MS_PAR_MINUTE = 60_000;
const MS_PAR_HEURE = 60 * MS_PAR_MINUTE;
const MS_PAR_JOUR = 24 * MS_PAR_HEURE;

export function enMs(instant: Instant): number {
  const ms =
    instant instanceof Date
      ? instant.getTime()
      : typeof instant === "number"
        ? instant
        : Date.parse(instant);
  if (!Number.isFinite(ms)) throw new RangeError(`Instant invalide : ${String(instant)}`);
  return ms;
}

interface Composantes {
  annee: number;
  mois: number;
  jour: number;
  heure: number;
  minute: number;
  seconde: number;
  milli: number;
}

function composantes(instant: Instant): Composantes {
  const d = new Date(enMs(instant) + DECALAGE_MINUTES * MS_PAR_MINUTE);
  return {
    annee: d.getUTCFullYear(),
    mois: d.getUTCMonth() + 1,
    jour: d.getUTCDate(),
    heure: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    seconde: d.getUTCSeconds(),
    milli: d.getUTCMilliseconds(),
  };
}

const p2 = (n: number): string => String(n).padStart(2, "0");

/** Instant exprimé en heure de Douala, au format ISO avec décalage. */
export function versIsoDouala(instant: Instant): IsoDouala {
  const c = composantes(instant);
  return (
    `${String(c.annee).padStart(4, "0")}-${p2(c.mois)}-${p2(c.jour)}` +
    `T${p2(c.heure)}:${p2(c.minute)}:${p2(c.seconde)}.${String(c.milli).padStart(3, "0")}` +
    SUFFIXE_DECALAGE
  );
}

/** AAMMJJ en heure de Douala (ex. 270105 pour le 5 janvier 2027). */
export function aammjjDouala(instant: Instant): string {
  const c = composantes(instant);
  return `${p2(c.annee % 100)}${p2(c.mois)}${p2(c.jour)}`;
}

/** HHMM en heure de Douala. */
export function hhmmDouala(instant: Instant): string {
  const c = composantes(instant);
  return `${p2(c.heure)}${p2(c.minute)}`;
}

/** AAAA-MM-JJ en heure de Douala. */
export function jourDouala(instant: Instant): string {
  const c = composantes(instant);
  return `${String(c.annee).padStart(4, "0")}-${p2(c.mois)}-${p2(c.jour)}`;
}

/** Minuit (début du jour suivant) à Douala, en ms depuis l'époque. */
export function minuitSuivantDoualaMs(instant: Instant): number {
  const ms = enMs(instant);
  const local = ms + DECALAGE_MINUTES * MS_PAR_MINUTE;
  const debutJourLocal = local - (((local % MS_PAR_JOUR) + MS_PAR_JOUR) % MS_PAR_JOUR);
  return debutJourLocal + MS_PAR_JOUR - DECALAGE_MINUTES * MS_PAR_MINUTE;
}

export function ajouterMinutes(instant: Instant, minutes: number): IsoDouala {
  return versIsoDouala(enMs(instant) + minutes * MS_PAR_MINUTE);
}

export function ajouterHeures(instant: Instant, heures: number): IsoDouala {
  return versIsoDouala(enMs(instant) + heures * MS_PAR_HEURE);
}

export function ajouterJours(instant: Instant, jours: number): IsoDouala {
  return versIsoDouala(enMs(instant) + jours * MS_PAR_JOUR);
}

/** Écart `a - b` en minutes (négatif si `a` est avant `b`). */
export function ecartMinutes(a: Instant, b: Instant): number {
  return (enMs(a) - enMs(b)) / MS_PAR_MINUTE;
}

export function estAvant(a: Instant, b: Instant): boolean {
  return enMs(a) < enMs(b);
}
