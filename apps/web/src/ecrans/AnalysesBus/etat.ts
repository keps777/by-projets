import { ErreurHttp } from "@afrimove/api-client";
import type { AnalyseBus, EtatBus } from "./types";

/** « Bus inconnu » (404) n'est pas une panne : réessayer ne le fera pas apparaître. */
function introuvable(erreur: unknown): boolean {
  return erreur instanceof ErreurHttp && erreur.statut === 404;
}

/** Un bus qui n'a ni trajet ni recette cette semaine : il y a un en-tête à montrer, mais pas de chiffres. */
export function estVide(bus: AnalyseBus): boolean {
  return bus.trajets.length === 0 && bus.recette.total === 0;
}

/** L'état de l'écran d'après la lecture de l'analyse. */
export function etatDe(requete: {
  data: AnalyseBus | undefined;
  error: unknown;
  isError: boolean;
  isPending: boolean;
}): EtatBus {
  if (requete.data) return estVide(requete.data) ? "vide" : "pret";
  if (requete.isError) return introuvable(requete.error) ? "introuvable" : "erreur";
  if (requete.isPending) return "chargement";
  return "introuvable";
}
