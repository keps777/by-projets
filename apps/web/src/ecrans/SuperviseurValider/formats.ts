/** Formats d'affichage de la planche (valeurs de la maquette : « 13:58 », « − 1 000 », « Joseph »). */

/** `2027-01-05T13:58:00.000+01:00` -> `13:58` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Montant FCFA tel que la planche l'écrit : `694500` -> `694 500`, `-1000` -> `− 1 000` (vrai signe moins, une espace). */
export function montant(fcfa: number, avecPlus = false): string {
  const signe = fcfa < 0 ? "− " : avecPlus && fcfa > 0 ? "+ " : "";
  return signe + String(Math.abs(Math.trunc(fcfa))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « Joseph M. » -> « Joseph » : la planche écrit « Joseph · 10 derniers jours ». */
export function prenom(nom: string): string {
  return nom.trim().split(/\s+/)[0] ?? nom;
}

/** « Mme Essono » -> « Essono » : la planche écrit « signé Essono » à côté de « Mon PIN · Mme Essono ». */
export function nomSansTitre(nom: string): string {
  return nom.replace(/^(?:Mme|Mlle|Mr|M\.)\s+/i, "").trim();
}
