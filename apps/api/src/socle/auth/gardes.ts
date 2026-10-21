import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuditService } from "../audit/audit.service";
import { PersonnesRepository } from "../comptes/personnes.repository";
import {
  CLE_PUBLIC,
  CLE_ROLES,
  CLE_TOUT_AUTHENTIFIE,
  CLE_VENTE,
  type Utilisateur,
} from "./decorateurs";
import type { Role } from "./roles";
import { TokensService } from "./tokens.service";

interface RequeteHttp {
  method: string;
  path?: string;
  route?: { path?: string };
  headers: Record<string, string | string[] | undefined>;
  utilisateur?: Utilisateur;
}

/**
 * Première garde (globale) : identifie la personne à partir du jeton `Authorization: Bearer`.
 * Le rôle et la compagnie viennent de la base à chaque requête, pas du jeton : désactiver un
 * compte ou lui retirer un rôle prend effet immédiatement.
 */
@Injectable()
export class GardeAuthentification implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly personnes: PersonnesRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLE_PUBLIC, cibles)) return true;

    const req = ctx.switchToHttp().getRequest<RequeteHttp>();
    const en = req.headers["authorization"];
    const valeur = Array.isArray(en) ? en[0] : en;
    const correspondance = /^Bearer ([A-Za-z0-9._-]+)$/.exec(valeur ?? "");
    if (!correspondance?.[1]) throw new UnauthorizedException("Authentification requise");

    const contenu = await this.tokens.verifier(correspondance[1]);
    if (!contenu) throw new UnauthorizedException("Jeton invalide ou expiré");
    const personne = await this.personnes.trouverParId(contenu.sub);
    if (!personne || !personne.actif || !personne.roles.includes(contenu.role)) {
      throw new UnauthorizedException("Jeton invalide ou expiré");
    }
    req.utilisateur = {
      id: personne.id,
      role: contenu.role,
      compagnieId: personne.compagnieId,
      gareId: personne.gareId,
    };
    return true;
  }
}

/**
 * Seconde garde (globale) : contrôle des rôles, REFUSÉ PAR DÉFAUT.
 * Une route doit déclarer `@Public()`, `@Authentifie()`, `@Roles(...)` ou `@Vente(...)`.
 * Le rôle vérifié est le seul rôle actif de la session, pas l'ensemble des rôles du compte :
 * un compte guichetier + patron connecté en guichetier n'entre pas dans l'espace patron.
 */
@Injectable()
export class GardeRoles implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLE_PUBLIC, cibles)) return true;

    const req = ctx.switchToHttp().getRequest<RequeteHttp>();
    const utilisateur = req.utilisateur;
    if (!utilisateur) throw new UnauthorizedException("Authentification requise");

    const vente = this.reflector.getAllAndOverride<boolean>(CLE_VENTE, cibles) === true;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(CLE_ROLES, cibles);
    const toutAuthentifie =
      this.reflector.getAllAndOverride<boolean>(CLE_TOUT_AUTHENTIFIE, cibles) === true;

    let cause: string | null = null;
    if (vente && utilisateur.role === "afrimove") cause = "afrimove_ne_vend_jamais";
    else if (roles) {
      if (!roles.includes(utilisateur.role)) cause = "role_non_autorise";
    } else if (!toutAuthentifie) cause = "route_sans_regle_d_acces";

    if (cause === null) return true;
    await this.audit.enregistrer({
      action: "acces.refuse",
      resultat: "refus",
      acteur: {
        id: utilisateur.id,
        role: utilisateur.role,
        compagnieId: utilisateur.compagnieId,
      },
      details: { methode: req.method, route: req.route?.path ?? req.path ?? "?", cause },
    });
    throw new ForbiddenException("Accès refusé pour votre rôle");
  }
}
