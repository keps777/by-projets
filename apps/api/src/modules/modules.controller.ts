import { Body, Controller, Get, Header, HttpCode, Param, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  Authentifie,
  Roles,
  UtilisateurCourant,
  type Utilisateur,
} from "../socle/auth/decorateurs";
import {
  ModulesService,
  type ModuleChangeReponse,
  type ModulesActifsReponse,
  type ModulesAgenceReponse,
} from "./modules.service";

@ApiTags("Modules")
@Controller()
export class ModulesController {
  constructor(private readonly modules: ModulesService) {}

  @Roles("patron")
  @Get("patron/modules")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Patron : les 12 modules de l'agence, avec leurs exceptions par gare et par ville",
  })
  lister(@UtilisateurCourant() utilisateur: Utilisateur): Promise<ModulesAgenceReponse> {
    return this.modules.lister(utilisateur);
  }

  @Roles("patron")
  @Put("patron/modules/:code")
  @HttpCode(200)
  @ApiOperation({
    summary: "Patron : allumer ou masquer un module pour l'agence, une gare ou une ville",
    description:
      "Corps `ChangerModule` des contrats patron, signé par le PIN. Le socle `guichet_caisse` ne se " +
      "masque jamais (409 `MODULE_SOCLE`). Toute demande, acceptée ou refusée, entre au journal d'audit.",
  })
  @ApiResponse({ status: 200, description: "`ModuleChange` : le module après changement" })
  @ApiResponse({ status: 401, description: "Signature PIN absente (`PIN_REQUIS`)" })
  @ApiResponse({ status: 403, description: "PIN incorrect (`PIN_INCORRECT`)" })
  @ApiResponse({ status: 404, description: "Module, gare ou ville inconnu" })
  @ApiResponse({ status: 409, description: "Socle (`MODULE_SOCLE`) ou PIN non défini" })
  @ApiResponse({ status: 422, description: "Corps invalide, ou heure de l'appareil trop éloignée" })
  @ApiResponse({ status: 423, description: "PIN bloqué après trop d'essais" })
  changer(
    @Param("code") code: string,
    @Body() corps: unknown,
    @UtilisateurCourant() utilisateur: Utilisateur,
  ): Promise<ModuleChangeReponse> {
    return this.modules.changer(utilisateur, code, corps);
  }

  @Authentifie()
  @Get("modules/actifs")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Toutes les apps : l'état de chaque module vu de ma gare, de ma ville ou d'une agence",
    description:
      "Un compte d'agence lit sa propre agence (sa gare par défaut) ; un voyageur nomme l'agence. " +
      "Les apps masquent les entrées des modules inactifs au prochain rafraîchissement.",
  })
  @ApiQuery({ name: "agence", required: false, description: "Agence (voyageur, AfriMove)" })
  @ApiQuery({ name: "gare", required: false, description: "Gare vue (défaut : celle du compte)" })
  @ApiQuery({ name: "ville", required: false, description: "Ville vue, sans gare" })
  actifs(
    @UtilisateurCourant() utilisateur: Utilisateur,
    @Query("agence") agence?: unknown,
    @Query("gare") gare?: unknown,
    @Query("ville") ville?: unknown,
  ): Promise<ModulesActifsReponse> {
    return this.modules.actifs(utilisateur, { agence, gare, ville });
  }
}
