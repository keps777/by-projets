/** Formats d'affichage du billet (valeurs de la maquette Pass : « 08:00 », « 05.01 », « 3 h 30 », « 700 F »). */

/** `2027-01-05T08:00:00.000+01:00` -> `08:00` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** `2027-01-05T08:00:00.000+01:00` -> `05.01` (jour.mois, comme le billet de la maquette). */
export function dateCourte(iso: string): string {
  const morceaux = /^\d{4}-(\d{2})-(\d{2})T/.exec(iso);
  return morceaux ? `${morceaux[2]}.${morceaux[1]}` : "";
}

/** Durée du trajet : 210 -> `3 h 30`, 180 -> `3 h`, 45 -> `45 min`. */
export function dureeTrajet(minutes: number): string {
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  if (heures === 0) return `${reste} min`;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}

/** `700` -> `700 F`, `7500` -> `7 500 F` (espace simple, comme dans les planches). */
export function montantFcfa(montant: number): string {
  return `${String(Math.trunc(montant)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;
}

/**
 * Code de la ville de la souche (`DLA`). Une ville sans code de gare (champ facultatif du contrat) garde ses trois
 * premières lettres, sans accent : `Yaoundé` -> `YAO`.
 */
export function codeVille(ville: { code?: string | undefined; nom: string }): string {
  if (ville.code !== undefined && ville.code !== "") return ville.code;
  return ville.nom
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toLocaleUpperCase("fr");
}
