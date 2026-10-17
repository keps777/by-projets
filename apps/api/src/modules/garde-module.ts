import {
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Utilisateur } from "../socle/auth/decorateurs";
import { moduleDuCatalogue } from "./catalogue";
import { erreurApi } from "./commande";
import { ModulesService } from "./modules.service";

export const CLE_MODULE_REQUIS = "afrimove:module-requis";

/**
 * Réserve une route (ou un contrôleur) à un module : si l'agence du compte l'a masqué pour sa gare
 * ou sa ville, la route répond 404 `MODULE_MASQUE`, comme si elle n'existait pas. Les données du
 * module restent en base.
 *
 * ```ts
 * @ModuleRequis("colis")
 * @Roles("guichetier")
 * @Get("colis/:id")
 * ```
 *
 * S'utilise avec `@Roles` / `@Authentifie` : la garde lit le compte posé par l'authentification et
 * ne protège pas une route publique. Un compte sans agence (voyageur) n'est pas filtré ici : ses
 * routes nomment l'agence, et le service qui les sert appelle `ModulesService.estActif`.
 */
export function ModuleRequis(code: string) {
  if (!moduleDuCatalogue(code)) throw new Error(`@ModuleRequis : module inconnu « ${code} »`);
  return applyDecorators(SetMetadata(CLE_MODULE_REQUIS, code), UseGuards(GardeModule));
}

@Injectable()
export class GardeModule implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modules: ModulesService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const code = this.reflector.getAllAndOverride<string | undefined>(CLE_MODULE_REQUIS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (code === undefined) return true;
    const utilisateur = ctx.switchToHttp().getRequest<{ utilisateur?: Utilisateur }>().utilisateur;
    // Fermé par défaut : sans compte identifié, la route est publique ou mal déclarée.
    if (!utilisateur) throw erreurApi(401, "AUTHENTIFICATION_REQUISE", "Authentification requise");
    if (utilisateur.compagnieId === null) return true;
    const actif = await this.modules.estActif(utilisateur.compagnieId, code, {
      gareId: utilisateur.gareId,
    });
    if (!actif) throw erreurApi(404, "MODULE_MASQUE", "Cette fonction n'est pas disponible");
    return true;
  }
}
