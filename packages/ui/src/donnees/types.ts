/**
 * Variante d'affichage d'un composant du kit « données ».
 * - `mobile` : 390 px (les planches téléphone) ;
 * - `large` : 1280 px (planche Controle, salle de contrôle). Ce sont les mêmes composants,
 *   seules les tailles changent ; il n'y a pas de second kit.
 */
export type VarianteDonnees = "mobile" | "large";

/** Couleur d'état. `neutre` garde la couleur du texte courant (craie). */
export type EtatDonnees = "neutre" | "vert" | "ambre" | "rouge" | "bleu";
