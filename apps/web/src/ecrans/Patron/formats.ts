/** Formats d'affichage de l'accueil du patron (valeurs de la maquette : « 2,61 M », « + 8 % », « − 1 000 », « 14:05 »). */

/** `2027-01-05T14:05:00.000+01:00` -> `14:05` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** `2027-01-05T14:05:00.000+01:00` -> `2027-01-05` : le jour de Douala, sans passer par le fuseau de l'appareil. */
function jourDouala(iso: string): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(iso)?.[1] ?? "";
}

function decimale(valeur: number): string {
  return String(valeur).replace(".", ",");
}

/** Groupes de trois chiffres séparés par une espace : `1000` -> `1 000`. */
function groupes(entier: number): string {
  return String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Recette du jour comme la planche l'écrit : `2610000` -> `2,61 M`, `612000` -> `612 k`, `612500` -> `612,5 k`,
 * `950` -> `950`. Deux décimales au plus en millions, une en milliers, sans zéro inutile.
 */
export function recetteCourte(fcfa: number): string {
  const absolu = Math.abs(fcfa);
  const signe = fcfa < 0 ? "− " : "";
  if (absolu >= 1_000_000) return `${signe}${decimale(Math.round(absolu / 10_000) / 100)} M`;
  if (absolu >= 1000) return `${signe}${decimale(Math.round(absolu / 100) / 10)} k`;
  return `${signe}${absolu}`;
}

/** Variation face au jour de comparaison : `8` -> `+ 8 %`, `-14` -> `− 14 %`, `0,7` -> `+ 0,7 %`, `0` -> `0 %`. */
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
  return `${fcfa < 0 ? "−" : "+"} ${groupes(fcfa)}`;
}

export type QuandAlerte =
  | { genre: "heure"; heure: string }
  | { genre: "hier" }
  | { genre: "date"; date: string };

const DATE_COURTE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function jours(jour: string): number {
  return Date.parse(`${jour}T00:00:00Z`) / 86_400_000;
}

/**
 * Repère de date d'une alerte, comme la planche : l'heure (`14:00`) pour une alerte du jour, « hier » pour celle de la
 * veille, la date courte (`3 janv.`) au-delà. `maintenant` est l'instant du tableau du jour, pas l'horloge de l'appareil.
 */
export function quandAlerte(quand: string, maintenant: string): QuandAlerte {
  const ecartJours = jours(jourDouala(maintenant)) - jours(jourDouala(quand));
  if (!Number.isFinite(ecartJours) || ecartJours <= 0) {
    return { genre: "heure", heure: heureDouala(quand) };
  }
  if (ecartJours === 1) return { genre: "hier" };
  return { genre: "date", date: DATE_COURTE.format(new Date(`${jourDouala(quand)}T00:00:00Z`)) };
}
