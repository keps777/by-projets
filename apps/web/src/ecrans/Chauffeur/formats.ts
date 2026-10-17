/** Formats d'affichage de la feuille de route (valeurs de la maquette : « 45 000 », « 2 310 », « 81 k », « 5 janv. »). */

/** `45000` -> `45 000` (espace simple, comme la maquette). */
export function montantFcfa(fcfa: number): string {
  return String(Math.trunc(fcfa)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Montant en milliers dès 1 000 : `81000` -> `81 k`, `81500` -> `81,5 k`, `800` -> `800`. */
export function montantCourt(fcfa: number): string {
  if (Math.abs(fcfa) < 1000) return String(fcfa);
  const milliers = Math.round(fcfa / 100) / 10;
  return `${String(milliers).replace(".", ",")} k`;
}

/** `2027-01-05T08:34:00.000+01:00` -> `08:34` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** `2027-01-05` -> `{ jour: 5, mois: 1 }`. */
export function jourMois(jour: string): { jour: number; mois: number } {
  const [, mois = 1, jj = 1] = jour.split("-").map(Number);
  return { jour: jj, mois };
}
