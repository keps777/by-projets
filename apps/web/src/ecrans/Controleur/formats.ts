/** Formats de la planche « Controleur » : « 4 000 » (espace simple, comme la maquette) et « 09:14 ». */

/** `4000` -> `4 000`. */
export function montantFcfa(fcfa: number): string {
  return String(Math.trunc(fcfa)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** `2027-01-05T09:14:00.000+01:00` -> `09:14` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}
