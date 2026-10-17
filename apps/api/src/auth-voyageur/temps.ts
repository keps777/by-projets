/**
 * Heures de Douala (Africa/Douala, UTC+01:00, sans heure d'été).
 *
 * Recopie de `versIsoDouala` de `@afrimove/domain` (non compilé : l'API ne peut pas l'importer à
 * l'exécution, voir README de l'API). Les contrats voyageur exigent ce format (`SchemaIsoDouala`).
 */

const DECALAGE_MS = 60 * 60_000;
const p2 = (n: number): string => String(n).padStart(2, "0");

/** Instant en heure de Douala, au format ISO avec décalage : `2027-01-05T05:30:00.000+01:00`. */
export function versIsoDouala(instant: Date): string {
  const d = new Date(instant.getTime() + DECALAGE_MS);
  return (
    `${String(d.getUTCFullYear()).padStart(4, "0")}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}` +
    "+01:00"
  );
}
