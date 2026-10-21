/** Heure de Douala (UTC+1, sans heure d'été) : jour, minutes depuis minuit, formats courts. */

const DECALAGE_DOUALA_MS = 60 * 60_000;
const p2 = (n: number): string => String(n).padStart(2, "0");

/** `2027-01-05`, jour calendaire à Douala. */
export function jourDouala(instant: Date): string {
  const d = new Date(instant.getTime() + DECALAGE_DOUALA_MS);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/** Minutes écoulées depuis minuit à Douala (21 h = 1260). */
export function minutesDouala(instant: Date): number {
  const d = new Date(instant.getTime() + DECALAGE_DOUALA_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** `08h30`, heure de Douala. */
export function heureDouala(instant: Date): string {
  const d = new Date(instant.getTime() + DECALAGE_DOUALA_MS);
  return `${p2(d.getUTCHours())}h${p2(d.getUTCMinutes())}`;
}

/** `05/01 à 08h30`, heure de Douala. */
export function jourHeureDouala(instant: Date): string {
  const d = new Date(instant.getTime() + DECALAGE_DOUALA_MS);
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} à ${heureDouala(instant)}`;
}

/** Début (minuit à Douala) d'un jour `AAAA-MM-JJ`, ou `null` si le jour n'existe pas. */
export function debutDeJour(jour: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const d = new Date(`${jour}T00:00:00+01:00`);
  if (!Number.isFinite(d.getTime()) || jourDouala(d) !== jour) return null;
  return d;
}
