/**
 * Heures de Douala (Africa/Douala, UTC+01:00, sans heure d'été).
 *
 * Recopie de ce dont le module colis a besoin dans `@afrimove/domain` (`temps.ts`) : le domaine
 * n'est pas compilé, l'API ne peut pas l'importer à l'exécution (voir README de `apps/api`).
 * `parite.test.ts` vérifie que les deux restent identiques.
 */

const MS_PAR_MINUTE = 60_000;
const MS_PAR_JOUR = 24 * 60 * MS_PAR_MINUTE;
const DECALAGE_MS = 60 * MS_PAR_MINUTE;

export type Instant = Date | number | string;

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

export function ajouterJours(instant: Instant, jours: number): string {
  return versIsoDouala(enMs(instant) + jours * MS_PAR_JOUR);
}

/** Ajoute des jours ouvrés (hors samedi et dimanche, à Douala). */
export function ajouterJoursOuvres(instant: Instant, jours: number): string {
  let ms = enMs(instant);
  let restant = jours;
  while (restant > 0) {
    ms += MS_PAR_JOUR;
    const jourSemaine = new Date(ms + DECALAGE_MS).getUTCDay(); // 0 dimanche, 6 samedi
    if (jourSemaine !== 0 && jourSemaine !== 6) restant -= 1;
  }
  return versIsoDouala(ms);
}
