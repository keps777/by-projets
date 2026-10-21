/**
 * Heures de Douala (Africa/Douala, UTC+01:00, sans heure d'été).
 *
 * Recopie de ce dont le suivi GPS a besoin : le domaine n'est pas compilé, l'API ne l'importe pas
 * à l'exécution (voir le README de l'API).
 */

export type Instant = Date | number | string;

const DECALAGE_MS = 60 * 60_000;
export const MS_PAR_SECONDE = 1000;
export const MS_PAR_MINUTE = 60_000;

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

/** « HH:MM » à Douala. */
export function hhmmDouala(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
