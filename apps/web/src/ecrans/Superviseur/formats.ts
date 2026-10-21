/** Formats d'affichage de l'accueil du superviseur (valeurs de la maquette : « 14:02 », « − 1 000 », « 0171 »). */

/** `2027-01-05T14:02:00.000+01:00` -> `14:02` : les heures de l'API portent déjà le décalage de Douala. */
export function heureDouala(iso: string): string {
  return /T(\d{2}:\d{2})/.exec(iso)?.[1] ?? "";
}

/** Montant FCFA tel que la planche l'écrit : `694500` -> `694 500`, `-1000` -> `− 1 000` (vrai signe moins, une espace). */
export function montant(fcfa: number): string {
  const signe = fcfa < 0 ? "− " : "";
  return signe + String(Math.abs(fcfa)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Numéro de billet sur quatre chiffres : `171` -> `0171`. */
export function sequenceBillet(sequence: number): string {
  return String(sequence).padStart(4, "0");
}

export type CouleurRemplissage = "vert" | "ambre" | "rouge";

/**
 * Couleur du remplissage « 38/40 ». La planche en montre trois : 38/40 (95 %) vert, 19/40 (47,5 %) ambre, 9/40
 * (22,5 %) rouge. Le seuil rouge est celui de la fusion proposée (sous 40 %) ; le vert commence à 80 % comme dans
 * le kit (`SEUILS_REMPLISSAGE`).
 */
export const SEUIL_FUSION_POURCENT = 40;
export const SEUIL_VERT_POURCENT = 80;

export function couleurRemplissage(vendus: number, capacite: number): CouleurRemplissage {
  const pourcent = capacite > 0 ? (vendus / capacite) * 100 : 0;
  if (pourcent >= SEUIL_VERT_POURCENT) return "vert";
  if (pourcent >= SEUIL_FUSION_POURCENT) return "ambre";
  return "rouge";
}
