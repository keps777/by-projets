import { ACCUEIL_ESPACE } from "@/coquille/roles";

/**
 * Bouton « retour » matériel d'Android (AM-184).
 *
 * Sans règle, le greffon @capacitor/app capte le bouton et ne fait rien quand il n'y a plus d'historique : on ne
 * pourrait plus quitter l'application. Règle posée ici :
 * - sur la page d'accueil d'un espace (ou l'entrée de l'application), le retour QUITTE l'application, comme sur
 *   n'importe quelle application Android : on ne revient pas à la page de connexion une fois connecté ;
 * - ailleurs, il revient à l'écran précédent ; sans écran précédent, il quitte.
 */

export type ActionRetour = "reculer" | "quitter";

/** Pages qui sont une racine : l'accueil de chaque espace, plus l'entrée de l'application. */
export const RACINES: readonly string[] = [...Object.values(ACCUEIL_ESPACE), "/", "/bienvenue"];

function sansBarreFinale(chemin: string): string {
  return chemin.length > 1 ? chemin.replace(/\/+$/, "") : chemin;
}

export function actionRetour(
  peutReculer: boolean,
  chemin: string,
  racines: readonly string[] = RACINES,
): ActionRetour {
  if (racines.includes(sansBarreFinale(chemin))) return "quitter";
  return peutReculer ? "reculer" : "quitter";
}
