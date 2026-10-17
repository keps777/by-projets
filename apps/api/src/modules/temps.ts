/**
 * Heure de Douala (Africa/Douala, UTC+01:00, sans heure d'été), au format ISO avec décalage :
 * `2027-01-05T05:30:00.000+01:00`. Recopie de `versIsoDouala` de `@afrimove/domain` (non compilé,
 * donc non importable par l'API) ; `parite.test.ts` compare les deux.
 */
const DECALAGE_MS = 60 * 60_000;

const p2 = (n: number): string => String(n).padStart(2, "0");

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
