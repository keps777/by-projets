/** Formats d'affichage de l'accueil du guichet (valeurs de la maquette : « 08:30 », « 612 k », « écart 0 »). */

/** `2027-01-05T08:30:00.000+01:00` -> `08:30` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Montant en milliers de FCFA quand il dépasse 1 000 : `612000` -> `612 k`, `612500` -> `612,5 k`. */
export function montantCourt(fcfa: number): string {
  if (Math.abs(fcfa) < 1000) return String(fcfa);
  const milliers = Math.round(fcfa / 100) / 10;
  return `${String(milliers).replace(".", ",")} k`;
}

const GROUPES = new Intl.NumberFormat("fr-FR", { useGrouping: true });

/** Écart de caisse : `0` -> `0`, `-1000` -> `− 1 000` (comme la planche Caisse), `500` -> `+ 500`. */
export function ecartCaisse(fcfa: number): string {
  if (fcfa === 0) return "0";
  const absolu = GROUPES.format(Math.abs(fcfa)).replace(/[  ]/g, " ");
  return `${fcfa < 0 ? "−" : "+"} ${absolu}`;
}
