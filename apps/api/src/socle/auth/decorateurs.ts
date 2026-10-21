import {
  SetMetadata,
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { ROLES_VENTE, type Role, type RoleVente } from "./roles";

/**
 * Contrôle d'accès « refusé par défaut » : une route sans l'un de ces décorateurs est refusée
 * (403) et un test de parcours échoue.
 */

export const CLE_PUBLIC = "afrimove:public";
export const CLE_ROLES = "afrimove:roles";
export const CLE_TOUT_AUTHENTIFIE = "afrimove:authentifie";
export const CLE_VENTE = "afrimove:vente";

/** Route ouverte à tous (santé, connexion). */
export const Public = () => SetMetadata(CLE_PUBLIC, true);

/** Route réservée aux rôles listés (le rôle actif du jeton doit en faire partie). */
export const Roles = (...roles: Role[]) =>
  applyDecorators(SetMetadata(CLE_ROLES, roles), ApiBearerAuth());

/** Route ouverte à tout compte connecté, quel que soit son rôle (ex. « qui suis-je »). */
export const Authentifie = () =>
  applyDecorators(SetMetadata(CLE_TOUT_AUTHENTIFIE, true), ApiBearerAuth());

/**
 * Route de vente de billet. Réservée aux rôles qui vendent ; AfriMove n'en fait jamais partie, et
 * la garde le refuse même si quelqu'un l'ajoute par erreur à `@Roles`.
 */
export const Vente = (...roles: RoleVente[]) => {
  const autorises: readonly RoleVente[] = roles.length > 0 ? roles : ROLES_VENTE;
  for (const r of autorises) {
    if (!(ROLES_VENTE as readonly string[]).includes(r)) {
      throw new Error(`@Vente : le rôle « ${r} » ne vend pas`);
    }
  }
  return applyDecorators(
    SetMetadata(CLE_VENTE, true),
    SetMetadata(CLE_ROLES, [...autorises]),
    ApiBearerAuth(),
  );
};

/** Compte connecté, posé sur la requête par la garde d'authentification. */
export interface Utilisateur {
  id: string;
  role: Role;
  compagnieId: string | null;
  gareId: string | null;
}

export const UtilisateurCourant = createParamDecorator(
  (_donnee: unknown, ctx: ExecutionContext): Utilisateur => {
    const req = ctx.switchToHttp().getRequest<{ utilisateur?: Utilisateur }>();
    if (!req.utilisateur) throw new Error("UtilisateurCourant utilisé sur une route publique");
    return req.utilisateur;
  },
);
