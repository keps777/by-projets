/**
 * Valeurs de la démonstration (mode démo, scénario « ColisEnvoi » seulement) : la planche montre le formulaire déjà
 * rempli, photo prise, mais l'API n'a ni brouillon ni dernier colis à proposer. Ces valeurs sont celles de
 * `fixtures/ecrans/ColisEnvoi.ts` (un test les compare). Hors démo, le formulaire commence vide.
 */
export const DEMO_COLIS_ENVOI = {
  /** Référence de la photo « déjà prise » de la planche. */
  photoRef: "photo-demo",
  contenu: "Médicaments et vêtements",
  valeur: "25 000",
} as const;
