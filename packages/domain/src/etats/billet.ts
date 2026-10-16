import { creerMachine } from "../machine";

/**
 * Billet : réservé → payé → embarqué → voyagé.
 * Branches : annulé, non présenté, reporté. Jamais de retour après « embarqué ».
 */
export const ETATS_BILLET = [
  "reserve",
  "paye",
  "embarque",
  "voyage",
  "annule",
  "non_presente",
  "reporte",
] as const;
export type EtatBillet = (typeof ETATS_BILLET)[number];

export const ACTIONS_BILLET = [
  "payer",
  "embarquer",
  "terminer",
  "annuler",
  "marquer_non_presente",
  "reporter",
  "reprogrammer",
] as const;
export type ActionBillet = (typeof ACTIONS_BILLET)[number];

export const MACHINE_BILLET = creerMachine<EtatBillet, ActionBillet>({
  nom: "billet",
  etats: ETATS_BILLET,
  actions: ACTIONS_BILLET,
  initial: "reserve",
  transitions: {
    reserve: { payer: "paye", annuler: "annule" },
    paye: {
      embarquer: "embarque",
      annuler: "annule",
      marquer_non_presente: "non_presente",
      reporter: "reporte",
    },
    embarque: { terminer: "voyage" },
    voyage: {},
    annule: {},
    non_presente: { reporter: "reporte" },
    reporte: { reprogrammer: "paye", annuler: "annule" },
  },
});
