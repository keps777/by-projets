/**
 * Heures de Douala (Africa/Douala, UTC+01:00, sans heure d'été).
 *
 * Recopie de ce dont la synchronisation a besoin dans `@afrimove/domain` (`temps.ts`) : le domaine
 * n'est pas compilé, l'API ne peut pas l'importer à l'exécution (voir README, « Limites connues »).
 * `sync.parite.test.ts` vérifie que les deux restent identiques.
 */

const DECALAGE_MS = 60 * 60_000;
export const MS_PAR_MINUTE = 60_000;
export const MS_PAR_HEURE = 60 * MS_PAR_MINUTE;

const p2 = (n: number): string => String(n).padStart(2, "0");

/** Instant en heure de Douala, au format ISO avec décalage : `2027-01-05T05:30:00.000+01:00`. */
export function versIsoDouala(instant: Date | number | string): string {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  if (!Number.isFinite(ms)) throw new RangeError(`Instant invalide : ${String(instant)}`);
  const d = new Date(ms + DECALAGE_MS);
  return (
    `${String(d.getUTCFullYear()).padStart(4, "0")}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}` +
    "+01:00"
  );
}

/** AAMMJJ en heure de Douala (ex. 270105). */
export function aammjjDouala(instant: Date | number | string): string {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  const d = new Date(ms + DECALAGE_MS);
  return `${p2(d.getUTCFullYear() % 100)}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
}
