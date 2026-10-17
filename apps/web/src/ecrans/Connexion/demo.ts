/**
 * État de départ de la planche « Connexion » (docs/maquettes-v3/Connexion.dc.html, fixtures/ecrans/Connexion.ts) :
 * le numéro est saisi et le code reçu par SMS est à moitié tapé. Il ne sert qu'en mode démo avec le scénario
 * `Connexion` (banc de fidélité) ; hors de là, l'écran démarre vide. Le temps restant avant le renvoi vient, lui, de
 * l'API (`renvoiDansSecondes`).
 */
export const SCENARIO_CONNEXION = "Connexion";

export const DEMO_CONNEXION = {
  /** Numéro national, sans indicatif. */
  numero: "691221008",
  /** Premiers chiffres du code : « 4 8 2 _ ». */
  code: "482",
} as const;
