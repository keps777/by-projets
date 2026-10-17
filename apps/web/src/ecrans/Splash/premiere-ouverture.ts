import { ecrire, lire } from "@/coquille/stockage";

/**
 * Mémoire du « premier lancement » : l'écran de bienvenue n'apparaît qu'une fois. La clé est propre à l'écran
 * (la liste `CLES` de la coquille n'est pas modifiable depuis ce ticket).
 */
export const CLE_PREMIERE_OUVERTURE = "afrimove.premiere-ouverture";

/** Vrai quand l'écran de bienvenue a déjà été quitté (bouton « Commencer » ou « J'ai déjà un compte »). */
export function premiereOuvertureTerminee(): boolean {
  return lire(CLE_PREMIERE_OUVERTURE) === "1";
}

export function terminerPremiereOuverture(): void {
  ecrire(CLE_PREMIERE_OUVERTURE, "1");
}
