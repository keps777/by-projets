import type { IsoDouala } from "@afrimove/domain";

/**
 * Horloge figée des maquettes : mardi 5 janvier 2027, 07:38, fuseau Africa/Douala (UTC+01:00, sans
 * heure d'été). Toutes les données de démonstration sont calculées par rapport à cet instant.
 */
export const FUSEAU = "Africa/Douala";
export const JOUR = "2027-01-05";
export const HORLOGE: IsoDouala = "2027-01-05T07:38:00.000+01:00";

const HEURE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** « 08:00 » ou « 08:19:42 » le jour des maquettes → ISO en heure de Douala. */
export function heure(hhmm: string, jour: string = JOUR): IsoDouala {
  const m = HEURE.exec(hhmm);
  if (!m) throw new RangeError(`Heure invalide : « ${hhmm} » (HH:MM ou HH:MM:SS attendu)`);
  return `${jour}T${m[1]}:${m[2]}:${m[3] ?? "00"}.000+01:00`;
}

/** Jour des maquettes décalé de `n` jours (négatif = avant), au format AAAA-MM-JJ. */
export function jourDecale(n: number): string {
  const ms = Date.parse(`${JOUR}T12:00:00Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
