/**
 * Le superviseur connecté. Le contrat de la planche (`SuperviseurEquipe`) ne dit pas qui regarde l'écran, et la
 * session mock (AM-017 viendra) ne porte qu'un rôle : on garde ici la personne de la planche (Mme Essono, Akwa).
 * Point douteux signalé dans le rapport du ticket : à remplacer par la personne de la session quand elle existera.
 */
export const SUPERVISEUR = { id: "pers-essono", nom: "Mme Essono" } as const;

/** Réglages du clavier PIN du superviseur (mêmes valeurs que SuperviseurValider : 6 chiffres, 3 essais, 15 min). */
export const PIN = { longueur: 6, essaisMax: 3, blocageMinutes: 15 } as const;
