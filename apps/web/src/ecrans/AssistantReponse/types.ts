import type { patron } from "@afrimove/api-client";

/** Ce que `useConversationAssistant` renvoie (le contrat `ConversationAssistant`, déjà validé par le client). */
export type Conversation = NonNullable<ReturnType<typeof patron.useConversationAssistant>["data"]>;
/** Une question du patron et la réponse de l'assistant. */
export type Echange = Conversation["echanges"][number];
export type ActionAssistant = Echange["actions"][number];

/** Une ligne du réseau, telle que `useAnalyses` la liste (de quoi ouvrir son réglage ou son analyse). */
export interface LigneReseau {
  ligneId: string;
  nom: string;
}

/** Le graphique d'une réponse détaillée : une barre par jour, hauteur en %, les jours en écart en rouge. */
export interface Graphique {
  remplissageParJour: readonly number[];
  /** Rangs (1 = le plus ancien) des jours en écart. */
  joursEnEcart: readonly number[];
}
