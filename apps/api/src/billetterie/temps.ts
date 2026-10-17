/**
 * Heures de Douala (Africa/Douala, UTC+01:00, sans heure d'été).
 *
 * Recopie de ce dont la billetterie a besoin dans `@afrimove/domain` (`temps.ts`) : le domaine n'est
 * pas compilé, l'API ne peut pas l'importer à l'exécution (voir README). `parite.test.ts` vérifie
 * que les deux restent identiques.
 */

export type Instant = Date | number | string;

const DECALAGE_MS = 60 * 60_000;
export const MS_PAR_MINUTE = 60_000;
export const MS_PAR_HEURE = 60 * MS_PAR_MINUTE;
export const MS_PAR_JOUR = 24 * MS_PAR_HEURE;

const p2 = (n: number): string => String(n).padStart(2, "0");

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

/** Heure du jour à Douala (0 à 23). */
export function heureDouala(instant: Instant): number {
  return new Date(enMs(instant) + DECALAGE_MS).getUTCHours();
}

/** « HH:MM » à Douala. */
export function hhmmDouala(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** Début (minuit à Douala) du jour `AAAA-MM-JJ`, en ms depuis l'époque. */
export function debutDuJourDoualaMs(jour: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (!m) throw new RangeError(`Jour invalide : ${jour}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - DECALAGE_MS;
}

/** Vrai si `jour` est une date calendaire réelle (pas de 31 février). */
export function jourValide(jour: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return false;
  return jourDouala(debutDuJourDoualaMs(jour)) === jour;
}

export function ajouterMinutes(instant: Instant, minutes: number): string {
  return versIsoDouala(enMs(instant) + minutes * MS_PAR_MINUTE);
}

/** Écart `a - b` en minutes (négatif si `a` est avant `b`). */
export function ecartMinutes(a: Instant, b: Instant): number {
  return (enMs(a) - enMs(b)) / MS_PAR_MINUTE;
}
