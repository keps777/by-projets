import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { InscriptionRelaisService } from "./inscription.service";
import {
  lireActivationRelais,
  lireBrouillonRelais,
  lireFicheRelais,
  lireRefusDemande,
  lireVisite,
} from "./validation";

/**
 * Devenir point relais, côté voyageur (planches « RelaisDevenir », « RelaisInscription » et
 * « RelaisVerification »). Opérations : `partenaires.relais.programme`, `.formulaire`, `.brouillon`,
 * `.envoyer`, `.suivi`.
 */
@ApiTags("Points relais · inscription")
@Controller("partenaires/relais")
export class InscriptionRelaisController {
  constructor(private readonly inscription: InscriptionRelaisService) {}

  @Roles("voyageur")
  @Get("programme")
  @ApiOperation({ summary: "Voyageur : le programme « Deviens point de relais »" })
  programme() {
    return this.inscription.programme();
  }

  @Roles("voyageur")
  @Get("formulaire")
  @ApiOperation({ summary: "Voyageur : la fiche de la boutique, préremplie avec le brouillon" })
  formulaire(@UtilisateurCourant() u: Utilisateur) {
    return this.inscription.formulaire(u);
  }

  @Roles("voyageur")
  @Put("brouillon")
  @ApiOperation({ summary: "Voyageur : garder la fiche à moitié remplie" })
  brouillon(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.inscription.enregistrerBrouillon(u, lireBrouillonRelais(corps).fiche);
  }

  @Roles("voyageur")
  @Post("demandes")
  @ApiOperation({ summary: "Voyageur : envoyer la fiche, un dossier R-… est ouvert" })
  deposer(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.inscription.deposer(u, lireFicheRelais(corps));
  }

  @Roles("voyageur")
  @Get("demandes/moi")
  @ApiOperation({ summary: "Voyageur : le suivi de ma demande (jalons, code relais réservé)" })
  suivi(@UtilisateurCourant() u: Utilisateur, @Query("dossier") dossier?: string) {
    return this.inscription.suivi(u, dossier && dossier.length > 0 ? dossier : undefined);
  }
}

/**
 * Vérification d'une demande par un agent AfriMove. Ces routes n'existent pas dans les contrats : ils
 * décrivent ce que voit le commerçant, pas le travail de l'agent.
 */
@ApiTags("Points relais · agents AfriMove")
@Controller("partenaires/relais/demandes")
export class AgentsRelaisController {
  constructor(private readonly inscription: InscriptionRelaisService) {}

  @Roles("afrimove")
  @Post(":dossier/visite")
  @HttpCode(200)
  @ApiOperation({
    summary: "Agent : fixer la visite (ou l'appel vidéo), position et horaires validés",
  })
  visite(
    @UtilisateurCourant() u: Utilisateur,
    @Param("dossier") dossier: string,
    @Body() corps: unknown,
  ) {
    return this.inscription.planifierVisite(u, dossier, lireVisite(corps));
  }

  @Roles("afrimove")
  @Post(":dossier/activation")
  @HttpCode(200)
  @ApiOperation({
    summary: "Agent : activer le relais après la visite (le compte reçoit le rôle relais)",
  })
  activation(
    @UtilisateurCourant() u: Utilisateur,
    @Param("dossier") dossier: string,
    @Body() corps: unknown,
  ) {
    return this.inscription.activer(u, dossier, lireActivationRelais(corps));
  }

  @Roles("afrimove")
  @Post(":dossier/refus")
  @HttpCode(200)
  @ApiOperation({ summary: "Agent : refuser la demande, avec le motif" })
  refus(
    @UtilisateurCourant() u: Utilisateur,
    @Param("dossier") dossier: string,
    @Body() corps: unknown,
  ) {
    return this.inscription.refuser(u, dossier, lireRefusDemande(corps).motif);
  }
}
