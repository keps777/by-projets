import { creerMachine } from "../machine";

/**
 * Colis : enregistré → chargé → en route → déchargé → disponible → remis.
 * Branches : en relais, en livraison, livré, non retiré (J+7), retourné, perdu, litige.
 */
export const ETATS_COLIS = [
  "enregistre",
  "charge",
  "en_route",
  "decharge",
  "disponible",
  "remis",
  "en_relais",
  "en_livraison",
  "livre",
  "non_retire",
  "retourne",
  "perdu",
  "litige",
] as const;
export type EtatColis = (typeof ETATS_COLIS)[number];

export const ACTIONS_COLIS = [
  "charger",
  "expedier",
  "decharger",
  "rendre_disponible",
  "envoyer_en_relais",
  "mettre_en_livraison",
  "livrer",
  "remettre",
  "marquer_non_retire",
  "retourner",
  "declarer_perdu",
  "ouvrir_litige",
] as const;
export type ActionColis = (typeof ACTIONS_COLIS)[number];

export const MACHINE_COLIS = creerMachine<EtatColis, ActionColis>({
  nom: "colis",
  etats: ETATS_COLIS,
  actions: ACTIONS_COLIS,
  initial: "enregistre",
  transitions: {
    enregistre: { charger: "charge", ouvrir_litige: "litige" },
    charge: { expedier: "en_route", declarer_perdu: "perdu", ouvrir_litige: "litige" },
    en_route: { decharger: "decharge", declarer_perdu: "perdu", ouvrir_litige: "litige" },
    decharge: { rendre_disponible: "disponible", declarer_perdu: "perdu", ouvrir_litige: "litige" },
    disponible: {
      remettre: "remis",
      envoyer_en_relais: "en_relais",
      mettre_en_livraison: "en_livraison",
      marquer_non_retire: "non_retire",
      declarer_perdu: "perdu",
      ouvrir_litige: "litige",
    },
    en_relais: {
      remettre: "remis",
      marquer_non_retire: "non_retire",
      declarer_perdu: "perdu",
      ouvrir_litige: "litige",
    },
    en_livraison: {
      livrer: "livre",
      envoyer_en_relais: "en_relais",
      rendre_disponible: "disponible",
      declarer_perdu: "perdu",
      ouvrir_litige: "litige",
    },
    non_retire: { retourner: "retourne", remettre: "remis", ouvrir_litige: "litige" },
    remis: {},
    livre: {},
    retourne: {},
    perdu: { rendre_disponible: "disponible", ouvrir_litige: "litige" },
    litige: {
      rendre_disponible: "disponible",
      remettre: "remis",
      retourner: "retourne",
      declarer_perdu: "perdu",
    },
  },
});
