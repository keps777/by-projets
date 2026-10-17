/**
 * Scénario de démonstration de la planche « RelaisApp » (celui du banc de fidélité et des fixtures). Le code en cours
 * de saisie et la pièce déjà contrôlée ne viennent pas de l'API : ce sont les gestes du relais au moment où la
 * maquette est figée (le code de Ngo Thérèse est 482913, cinq chiffres déjà tapés).
 */
export const SCENARIO_RELAIS_APP = "RelaisApp";

export const DEMO_RELAIS_APP = {
  saisie: "48291",
  pieceVerifiee: true,
} as const;
