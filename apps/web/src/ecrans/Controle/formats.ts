/** Formats d'affichage de la salle de contrôle (valeurs de la planche : « 2,61 M », « + 8 % », « 1 412 500 », « − 1 000 »). */

/** `2027-01-05T14:05:00.000+01:00` -> `14:05` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** `2027-01-05T14:05:00.000+01:00` -> `2027-01-05` : le jour de Douala, sans passer par le fuseau de l'appareil. */
export function jourDouala(iso: string): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(iso)?.[1] ?? "";
}

function decimale(valeur: number): string {
  return String(valeur).replace(".", ",");
}

/** Groupes de trois chiffres séparés par une espace : `1412500` -> `1 412 500`. */
export function montantGroupe(entier: number): string {
  return String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Recette du jour comme la planche l'écrit : `2610000` -> `2,61 M`, `612000` -> `612 k`, `950` -> `950`.
 * Deux décimales au plus en millions, une en milliers, sans zéro inutile.
 */
export function recetteCourte(fcfa: number): string {
  const absolu = Math.abs(fcfa);
  const signe = fcfa < 0 ? "− " : "";
  if (absolu >= 1_000_000) return `${signe}${decimale(Math.round(absolu / 10_000) / 100)} M`;
  if (absolu >= 1000) return `${signe}${decimale(Math.round(absolu / 100) / 10)} k`;
  return `${signe}${absolu}`;
}

/** Variation face au jour de comparaison : `8` -> `+ 8 %`, `-14` -> `− 14 %`, `0` -> `0 %`. */
export function variation(pourcent: number): string {
  if (pourcent === 0) return "0 %";
  return `${pourcent < 0 ? "−" : "+"} ${decimale(Math.abs(pourcent))} %`;
}

/** Taux entier ou décimal : `86` -> `86 %`. */
export function taux(pourcent: number): string {
  return `${decimale(pourcent)} %`;
}

/** Écart de caisse : `-1000` -> `− 1 000` (vrai signe moins, une espace), `0` -> `0`, `500` -> `+ 500`. */
export function ecart(fcfa: number): string {
  if (fcfa === 0) return "0";
  return `${fcfa < 0 ? "−" : "+"} ${montantGroupe(fcfa)}`;
}

const JOUR_LONG = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const JOUR_SEMAINE = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" });
const DATE_COURTE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function dateDuJour(jour: string): Date {
  return new Date(`${jour}T00:00:00Z`);
}

/** `2027-01-05` -> `mardi 5 janvier 2027`. */
export function jourLong(jour: string): string {
  return Number.isNaN(dateDuJour(jour).getTime()) ? "" : JOUR_LONG.format(dateDuJour(jour));
}

/** `2027-01-05` -> `mardi` : le jour de la semaine, pour « vs mardi dernier ». */
export function jourDeLaSemaine(jour: string): string {
  return Number.isNaN(dateDuJour(jour).getTime()) ? "" : JOUR_SEMAINE.format(dateDuJour(jour));
}

export type Quand =
  | { genre: "heure"; heure: string }
  | { genre: "hier" }
  | { genre: "date"; date: string };

function jours(jour: string): number {
  return Date.parse(`${jour}T00:00:00Z`) / 86_400_000;
}

/**
 * Repère de date d'un élément « à traiter » : l'heure (`14:00`) pour celui du jour, « hier » pour celui de la veille,
 * la date courte (`3 janv.`) au-delà. `maintenant` est l'instant de la salle, pas l'horloge de l'appareil.
 */
export function quand(instant: string, maintenant: string): Quand {
  const ecartJours = jours(jourDouala(maintenant)) - jours(jourDouala(instant));
  if (!Number.isFinite(ecartJours) || ecartJours <= 0) {
    return { genre: "heure", heure: heureDouala(instant) };
  }
  if (ecartJours === 1) return { genre: "hier" };
  return { genre: "date", date: DATE_COURTE.format(dateDuJour(jourDouala(instant))) };
}
