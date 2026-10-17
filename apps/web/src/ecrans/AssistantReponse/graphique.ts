import type { Graphique } from "./types";

/**
 * Le graphique de la réponse détaillée de la planche (14 jours de remplissage de Douala → Bafoussam, les deux mercredis
 * en rouge). Le contrat `ReponseAssistant` ne porte pas cette série : l'écran ne la dessine que dans la démonstration
 * (valeurs de la planche, `visuel` du scénario AssistantReponse). Quand le contrat la portera, elle viendra de l'API.
 */
export const GRAPHIQUE_DEMO: Graphique = {
  remplissageParJour: [80, 78, 42, 74, 90, 100, 70, 76, 72, 38, 70, 86, 96, 66],
  joursEnEcart: [3, 10],
};
