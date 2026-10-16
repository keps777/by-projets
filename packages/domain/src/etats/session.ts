import { creerMachine } from "../machine";

/**
 * Session de caisse : ouverte → clôturée → validée.
 * Le superviseur peut refuser une clôture (« Refuser · recompter ») : la session redevient ouverte.
 * La clôture automatique à minuit est une action `cloturer` faite par le système.
 */
export const ETATS_SESSION = ["ouverte", "cloturee", "validee"] as const;
export type EtatSession = (typeof ETATS_SESSION)[number];

export const ACTIONS_SESSION = ["cloturer", "refuser", "valider"] as const;
export type ActionSession = (typeof ACTIONS_SESSION)[number];

export const MACHINE_SESSION = creerMachine<EtatSession, ActionSession>({
  nom: "session de caisse",
  etats: ETATS_SESSION,
  actions: ACTIONS_SESSION,
  initial: "ouverte",
  transitions: {
    ouverte: { cloturer: "cloturee" },
    cloturee: { refuser: "ouverte", valider: "validee" },
    validee: {},
  },
});
