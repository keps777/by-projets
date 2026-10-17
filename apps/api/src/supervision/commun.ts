import type { Utilisateur } from "../socle/auth/decorateurs";
import { interdit } from "../caisse/erreurs";

/**
 * La gare d'un superviseur. Un superviseur ne voit et ne décide que dans sa gare : sans gare, ou avec
 * la gare d'un autre, il est refusé (jamais « toutes les gares »).
 */
export function gareDe(u: Utilisateur, demandee?: string): string {
  if (!u.gareId) {
    throw interdit("GARE_REQUISE", "Ce compte n'est rattaché à aucune gare");
  }
  if (demandee !== undefined && demandee !== u.gareId) {
    throw interdit("GARE_AUTRE", "Cette gare n'est pas la vôtre");
  }
  return u.gareId;
}

/** Texte optionnel d'une requête (`?gareId=…`) : absent ou vide → `undefined`. */
export function texteDeRequete(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
