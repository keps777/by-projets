import { creerMachine } from "../machine";

/**
 * Départ : programmé → en vente → embarquement → parti → arrivé.
 * Branches : annulé, retardé, fusionné. Une fois l'embarquement ouvert, on ne peut plus ni annuler
 * ni fusionner : le départ part (éventuellement retardé) puis arrive.
 */
export const ETATS_DEPART = [
  "programme",
  "en_vente",
  "embarquement",
  "parti",
  "arrive",
  "annule",
  "retarde",
  "fusionne",
] as const;
export type EtatDepart = (typeof ETATS_DEPART)[number];

export const ACTIONS_DEPART = [
  "ouvrir_vente",
  "ouvrir_embarquement",
  "partir",
  "arriver",
  "annuler",
  "retarder",
  "reprendre_vente",
  "fusionner",
] as const;
export type ActionDepart = (typeof ACTIONS_DEPART)[number];

export const MACHINE_DEPART = creerMachine<EtatDepart, ActionDepart>({
  nom: "depart",
  etats: ETATS_DEPART,
  actions: ACTIONS_DEPART,
  initial: "programme",
  transitions: {
    programme: {
      ouvrir_vente: "en_vente",
      annuler: "annule",
      retarder: "retarde",
      fusionner: "fusionne",
    },
    en_vente: {
      ouvrir_embarquement: "embarquement",
      annuler: "annule",
      retarder: "retarde",
      fusionner: "fusionne",
    },
    embarquement: { partir: "parti", retarder: "retarde" },
    parti: { arriver: "arrive" },
    arrive: {},
    annule: {},
    retarde: {
      reprendre_vente: "en_vente",
      ouvrir_embarquement: "embarquement",
      annuler: "annule",
      fusionner: "fusionne",
    },
    fusionne: {},
  },
});
