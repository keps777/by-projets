import { ErreurColis } from "../colis/erreurs";
import type { Utilisateur } from "../socle/auth/decorateurs";

/**
 * Briques communes des services : erreurs au format de l'API (`{ code, message, details? }`, celui du module
 * colis), compagnie de la personne connectée, écriture conditionnelle avec nouvelle tentative.
 */

export const erreur = (statut: number, code: string, message: string, details?: unknown) =>
  new ErreurColis(statut, code, message, details);

/** La compagnie du compte connecté ; un compte sans compagnie n'a pas accès aux échanges. */
export function compagnieDe(utilisateur: Pick<Utilisateur, "compagnieId">): string {
  if (!utilisateur.compagnieId) {
    throw erreur(403, "sans_compagnie", "Ce compte n'est rattaché à aucune compagnie");
  }
  return utilisateur.compagnieId;
}

/** Les rôles qui scannent un passage de témoin ou un embarquement, sur le terrain. */
export const ROLES_TERRAIN = [
  "convoyeur",
  "chauffeur",
  "guichetier",
  "controleur",
  "superviseur",
] as const;

const TENTATIVES = 5;

/**
 * Lit, transforme, écrit si la version n'a pas bougé ; sinon relit et recommence. `transformer` peut lever
 * une erreur (elle sort telle quelle) et peut renvoyer l'objet inchangé (rien n'est écrit).
 */
export async function modifier<T extends { version: number }>(
  lire: () => Promise<T | null>,
  ecrire: (suivant: T, versionAttendue: number) => Promise<boolean>,
  transformer: (actuel: T) => T,
  absent: () => Error,
): Promise<T> {
  for (let i = 0; i < TENTATIVES; i++) {
    const actuel = await lire();
    if (!actuel) throw absent();
    const suivant = transformer(actuel);
    if (suivant === actuel) return actuel;
    if (await ecrire(suivant, actuel.version)) return { ...suivant, version: actuel.version + 1 };
  }
  throw erreur(409, "conflit", "Modification simultanée, réessayez");
}
