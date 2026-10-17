import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { ColisService } from "./colis.service";
import { ReclamationsService } from "./reclamations.service";
import {
  lireChangementMode,
  lireDemandeCreation,
  lireDemandeDevis,
  lireEnvoiCode,
  lirePhoto,
  lireReclamation,
} from "./validation";

/**
 * Colis du voyageur (planches « ColisEnvoi » et « ColisCode »). Les noms d'opérations et les schémas
 * de réponse sont ceux de `packages/api-client/src/colis/operations.ts` :
 * `colis.options-envoi`, `colis.estimer-photo`, `colis.devis`, `colis.creer`, `colis.lire`,
 * `colis.envoyer-code`, `colis.reclamer`, `colis.changer-mode`.
 *
 * Les routes à segment fixe (`options-envoi`, `devis`, `photo`) sont déclarées avant `:colisId`.
 */
@ApiTags("Colis")
@Controller("colis")
export class ColisController {
  constructor(
    private readonly colis: ColisService,
    private readonly reclamations: ReclamationsService,
  ) {}

  @Roles("voyageur")
  @Get("options-envoi")
  @ApiOperation({
    summary: "Voyageur : départs, modes de retrait et assurance pour envoyer un colis",
  })
  optionsEnvoi(@UtilisateurCourant() u: Utilisateur, @Query("ville") ville?: string) {
    return this.colis.optionsEnvoi(u.id, ville && ville.length > 0 ? ville : undefined);
  }

  @Roles("voyageur")
  @Post("photo")
  @HttpCode(200)
  @ApiOperation({ summary: "Voyageur : lire la photo du colis (taille et poids estimés)" })
  async estimerPhoto(@Body() corps: unknown) {
    return this.colis.estimerPhoto(lirePhoto(corps).photoRef);
  }

  @Roles("voyageur")
  @Get("devis")
  @ApiOperation({ summary: "Voyageur : devis d'un colis, chaque ligne détaillée" })
  devis(@Query() requete: Record<string, unknown>) {
    return this.colis.devis(lireDemandeDevis(requete));
  }

  @Roles("voyageur")
  @Post()
  @ApiOperation({
    summary:
      "Voyageur : créer et payer un colis ; la réponse porte le code de retrait (expéditeur seul)",
  })
  creer(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.colis.creer(u.id, lireDemandeCreation(corps));
  }

  @Roles("voyageur")
  @Get(":colisId")
  @ApiOperation({
    summary: "Voyageur : colis, code de retrait et suivi (expéditeur ou destinataire)",
  })
  lire(@UtilisateurCourant() u: Utilisateur, @Param("colisId") colisId: string) {
    return this.colis.lire(u.id, colisId);
  }

  @Roles("voyageur")
  @Post(":colisId/code/envoi")
  @HttpCode(200)
  @ApiOperation({ summary: "Expéditeur : envoyer le code de retrait au destinataire seul" })
  envoyerCode(
    @UtilisateurCourant() u: Utilisateur,
    @Param("colisId") colisId: string,
    @Body() corps: unknown,
  ) {
    return this.colis.envoyerCode(u.id, colisId, lireEnvoiCode(corps).canal);
  }

  @Roles("voyageur")
  @Post(":colisId/reclamations")
  @ApiOperation({ summary: "Voyageur : ouvrir une réclamation (réponse sous 2 jours ouvrés)" })
  reclamer(
    @UtilisateurCourant() u: Utilisateur,
    @Param("colisId") colisId: string,
    @Body() corps: unknown,
  ) {
    return this.reclamations.ouvrir(u.id, colisId, lireReclamation(corps));
  }

  @Roles("voyageur")
  @Put(":colisId/mode")
  @ApiOperation({ summary: "Expéditeur : passer en relais ou en livraison moto après coup" })
  changerMode(
    @UtilisateurCourant() u: Utilisateur,
    @Param("colisId") colisId: string,
    @Body() corps: unknown,
  ) {
    return this.colis.changerMode(u.id, colisId, lireChangementMode(corps));
  }
}
