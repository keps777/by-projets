/**
 * Heures et mois de Douala (Africa/Douala, UTC+01:00, sans heure d'été). Recopie volontaire des
 * fonctions de `@afrimove/domain` : l'API n'importe pas le domaine à l'exécution (paquet non compilé).
 * Un mois comptable est `AAAA-MM`, un jour `AAAA-MM-JJ`, un instant un ISO avec `+01:00`.
 */

export type Instant = Date | number | string;

const MS_PAR_HEURE = 3_600_000;
const MS_PAR_JOUR = 24 * MS_PAR_HEURE;
const DECALAGE_MS = MS_PAR_HEURE;

const p2 = (n: number): string => String(n).padStart(2, "0");

export function enMs(instant: Instant): number {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  if (!Number.isFinite(ms)) throw new RangeError(`Instant invalide : ${String(instant)}`);
  return ms;
}

/** `2027-01-05T14:05:00.000+01:00`. */
export function versIsoDouala(instant: Instant): string {
  const d = new Date(enMs(instant) + DECALAGE_MS);
  return (
    `${String(d.getUTCFullYear()).padStart(4, "0")}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}` +
    "+01:00"
  );
}

/** `AAAA-MM-JJ` à Douala. */
export function jourDouala(instant: Instant): string {
  return versIsoDouala(instant).slice(0, 10);
}

/** `HH:MM` à Douala. */
export function heureDouala(instant: Instant): string {
  return versIsoDouala(instant).slice(11, 16);
}

/** `AAAA-MM` à Douala. */
export function moisDe(instant: Instant): string {
  return versIsoDouala(instant).slice(0, 7);
}

const MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function estMoisValide(mois: unknown): mois is string {
  return typeof mois === "string" && MOIS.test(mois);
}

function decouper(mois: string): { annee: number; mois: number } {
  const m = MOIS.exec(mois);
  if (!m) throw new RangeError(`Mois invalide : ${mois}`);
  return { annee: Number(m[1]), mois: Number(m[2]) };
}

/** Minuit (Douala) du premier jour du mois, en millisecondes. */
function debutMs(mois: string): number {
  const { annee, mois: m } = decouper(mois);
  return Date.UTC(annee, m - 1, 1) - DECALAGE_MS;
}

/** Premier instant du mois (inclus), ISO Douala. */
export function debutDuMois(mois: string): string {
  return versIsoDouala(debutMs(mois));
}

export function moisSuivant(mois: string): string {
  const { annee, mois: m } = decouper(mois);
  return m === 12 ? `${annee + 1}-01` : `${annee}-${p2(m + 1)}`;
}

export function moisPrecedent(mois: string): string {
  const { annee, mois: m } = decouper(mois);
  return m === 1 ? `${annee - 1}-12` : `${annee}-${p2(m - 1)}`;
}

/** Premier instant du mois suivant (exclu), ISO Douala : borne haute des requêtes du mois. */
export function debutDuMoisSuivant(mois: string): string {
  return debutDuMois(moisSuivant(mois));
}

export function comparerMois(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Les jours `AAAA-MM-JJ` du mois, du premier au dernier. */
export function joursDuMois(mois: string): string[] {
  const debut = debutMs(mois);
  const fin = debutMs(moisSuivant(mois));
  const jours: string[] = [];
  for (let t = debut; t < fin; t += MS_PAR_JOUR) jours.push(jourDouala(t));
  return jours;
}

function composantes(jour: string): [number, number, number] {
  const [a, m, j] = jour.split("-").map(Number);
  return [a ?? 0, m ?? 1, j ?? 1];
}

/** Jour de la semaine : 1 lundi … 7 dimanche. */
export function jourIso(jour: string): number {
  const [a, m, j] = composantes(jour);
  const d = new Date(Date.UTC(a, m - 1, j)).getUTCDay();
  return d === 0 ? 7 : d;
}

export function ajouterJours(jour: string, n: number): string {
  const [a, m, j] = composantes(jour);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

/** Minuit (Douala) du jour `AAAA-MM-JJ`, ISO Douala. */
export function debutDuJour(jour: string): string {
  const [a, m, j] = composantes(jour);
  return versIsoDouala(Date.UTC(a, m - 1, j) - DECALAGE_MS);
}

/** Le dimanche de la semaine (lundi à dimanche) qui contient `jour`. */
export function dimancheDeLaSemaine(jour: string): string {
  return ajouterJours(jour, 7 - jourIso(jour));
}

const NOMS_MOIS = [
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

/** « décembre » */
export function nomDuMois(mois: string): string {
  return NOMS_MOIS[decouper(mois).mois - 1] ?? "";
}

const capitale = (texte: string): string => `${texte.charAt(0).toUpperCase()}${texte.slice(1)}`;

/** « Décembre 2026 » */
export function libelleMois(mois: string): string {
  return `${capitale(nomDuMois(mois))} ${decouper(mois).annee}`;
}

/** « Décembre » : le libellé court des sélecteurs, avec l'année quand ce n'est pas l'année en cours. */
export function libelleCourtMois(mois: string, anneeCourante: number): string {
  const { annee } = decouper(mois);
  const base = capitale(nomDuMois(mois));
  return annee === anneeCourante ? base : `${base} ${annee}`;
}

/** « 05/12 » (jour et mois) d'un jour `AAAA-MM-JJ`. */
export function jourMois(jour: string): string {
  return `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
}
