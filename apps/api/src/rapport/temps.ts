/**
 * Heures et jours de Douala (Africa/Douala, UTC+01:00, sans heure d'été).
 *
 * Tout le module raisonne en « jour de Douala » (`AAAA-MM-JJ`) : le rapport du 5 janvier couvre de
 * 00:00 à 24:00 heure de Douala, quel que soit le fuseau du serveur.
 */

export const MS_PAR_MINUTE = 60_000;
export const MS_PAR_JOUR = 24 * 60 * MS_PAR_MINUTE;
const DECALAGE_MS = 60 * MS_PAR_MINUTE;

const p2 = (n: number): string => String(n).padStart(2, "0");

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/** `2027-01-05`, jour calendaire de Douala qui contient l'instant. */
export function jourDouala(instant: Date | number | string): string {
  const d = new Date(new Date(instant).getTime() + DECALAGE_MS);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/** Minutes écoulées depuis minuit à Douala (21 h = 1260). */
export function minutesDouala(instant: Date | number | string): number {
  const d = new Date(new Date(instant).getTime() + DECALAGE_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** `08:30`, heure de Douala. */
export function heureDouala(instant: Date | number | string): string {
  const m = minutesDouala(instant);
  return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
}

/** Instant en heure de Douala, au format ISO avec décalage : `2027-01-05T21:00:00.000+01:00`. */
export function versIsoDouala(instant: Date | number | string): string {
  const d = new Date(new Date(instant).getTime() + DECALAGE_MS);
  return (
    `${String(d.getUTCFullYear()).padStart(4, "0")}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}.` +
    `${String(d.getUTCMilliseconds()).padStart(3, "0")}+01:00`
  );
}

/** Début (00:00 à Douala) d'un jour `AAAA-MM-JJ`, ou `null` si ce jour n'existe pas au calendrier. */
export function debutDeJour(jour: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const d = new Date(`${jour}T00:00:00.000+01:00`);
  if (!Number.isFinite(d.getTime()) || jourDouala(d) !== jour) return null;
  return d;
}

/** Le jour d'avant ou d'après (`decalage` en jours, négatif pour reculer). */
export function decalerJour(jour: string, decalage: number): string {
  const debut = debutDeJour(jour);
  if (!debut) throw new RangeError(`Jour invalide : ${jour}`);
  return jourDouala(debut.getTime() + decalage * MS_PAR_JOUR + MS_PAR_JOUR / 2);
}

/** Nombre de jours entiers de `de` à `vers` (positif si `vers` est après `de`). */
export function joursEntre(de: string, vers: string): number {
  const a = debutDeJour(de);
  const b = debutDeJour(vers);
  if (!a || !b) throw new RangeError(`Jour invalide : ${de} ou ${vers}`);
  return Math.round((b.getTime() - a.getTime()) / MS_PAR_JOUR);
}

/** `270105` pour `2027-01-05` : le jour des numéros de billet, de colis et de caisse. */
export function aammjj(jour: string): string {
  if (!debutDeJour(jour)) throw new RangeError(`Jour invalide : ${jour}`);
  return `${jour.slice(2, 4)}${jour.slice(5, 7)}${jour.slice(8, 10)}`;
}

/** `mardi 5 janvier`. */
export function libelleJour(jour: string): string {
  const debut = debutDeJour(jour);
  if (!debut) throw new RangeError(`Jour invalide : ${jour}`);
  const d = new Date(debut.getTime() + DECALAGE_MS);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** Les bornes `[début, fin[` du jour, en instants ISO de Douala. */
export function bornesDuJour(jour: string): { debut: string; fin: string } {
  const debut = debutDeJour(jour);
  if (!debut) throw new RangeError(`Jour invalide : ${jour}`);
  return {
    debut: versIsoDouala(debut),
    fin: versIsoDouala(debut.getTime() + MS_PAR_JOUR),
  };
}

/** Vrai si l'instant tombe dans le jour de Douala donné. */
export function estDansLeJour(instant: string, jour: string): boolean {
  return jourDouala(instant) === jour;
}

/** `21:00` → 1260. */
export function minutesDeHeure(heure: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(heure);
  if (!m) throw new RangeError(`Heure invalide : ${heure}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
