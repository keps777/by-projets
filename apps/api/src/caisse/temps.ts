/**
 * Heures de Douala (Africa/Douala, UTC+01:00, sans heure d'été).
 *
 * Recopie de ce dont la caisse et la supervision ont besoin dans `@afrimove/domain` (`temps.ts`) :
 * le domaine n'est pas compilé, l'API ne peut pas l'importer à l'exécution (voir le README de l'API,
 * « Limites connues »). `parite.test.ts` vérifie que les deux restent identiques.
 */

export const MS_PAR_MINUTE = 60_000;
export const MS_PAR_HEURE = 60 * MS_PAR_MINUTE;
export const MS_PAR_JOUR = 24 * MS_PAR_HEURE;
const DECALAGE_MS = MS_PAR_HEURE;

export type Instant = Date | number | string;

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

const p2 = (n: number): string => String(n).padStart(2, "0");

/** Instant en heure de Douala, au format ISO avec décalage : `2027-01-05T05:30:00.000+01:00`. */
export function versIsoDouala(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return (
    `${String(d.getUTCFullYear()).padStart(4, "0")}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}` +
    "+01:00"
  );
}

/** AAMMJJ en heure de Douala (ex. 270105). */
export function aammjjDouala(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return `${p2(d.getUTCFullYear() % 100)}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
}

/** AAAA-MM-JJ en heure de Douala. */
export function jourDouala(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/** Minuit (début du jour suivant) à Douala, en ms depuis l'époque. */
export function minuitSuivantDoualaMs(instant: Instant): number {
  const local = enMs(instant) + DECALAGE_MS;
  const debutJourLocal = local - (((local % MS_PAR_JOUR) + MS_PAR_JOUR) % MS_PAR_JOUR);
  return debutJourLocal + MS_PAR_JOUR - DECALAGE_MS;
}

/** Début (00:00 à Douala) du jour qui contient `instant`, en ms depuis l'époque. */
export function debutJourDoualaMs(instant: Instant): number {
  return minuitSuivantDoualaMs(instant) - MS_PAR_JOUR;
}

/** Nombre de jours entiers (calendrier de Douala) de `a` à `b` : 0 le même jour, 1 le lendemain. */
export function joursEntre(a: Instant, b: Instant): number {
  return Math.round((debutJourDoualaMs(b) - debutJourDoualaMs(a)) / MS_PAR_JOUR);
}

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

/** « 5 janv. » : le jour et le mois abrégé, sans année (comme la fiche de l'équipe). */
export function jourMoisCourt(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}
