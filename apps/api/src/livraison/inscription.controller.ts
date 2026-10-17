import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { InscriptionLivreurService } from "./inscription.service";
import {
  lireActivationLivreur,
  lireDemandeLivreur,
  lireRefusLivreur,
  lireVerificationLivreur,
} from "./validation";

/**
 * Devenir livreur, côté voyageur (planches « LivreurDevenir » et « LivreurVerification »).
 * Opérations : `partenaires.livreur.programme`, `.envoyer`, `.suivi`.
 */
@ApiTags("Livraison moto · inscription")
@Controller("partenaires/livreurs")
export class InscriptionLivreurController {
  constructor(private readonly inscription: InscriptionLivreurService) {}

  @Roles("voyageur")
  @Get("programme")
  @ApiOperation({ summary: "Voyageur : le programme « Deviens livreur »" })
  programme(@UtilisateurCourant() u: Utilisateur) {
    return this.inscription.programme(u);
  }

  @Roles("voyageur")
  @Post("demandes")
  @ApiOperation({ summary: "Voyageur : envoyer la demande, un dossier L-… est ouvert" })
  deposer(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.inscription.deposer(u, lireDemandeLivreur(corps));
  }

  @Roles("voyageur")
  @Get("demandes/moi")
  @ApiOperation({ summary: "Voyageur : le suivi de ma demande (jalons, badge réservé)" })
  suivi(@UtilisateurCourant() u: Utilisateur, @Query("dossier") dossier?: string) {
    return this.inscription.suivi(u, dossier && dossier.length > 0 ? dossier : undefined);
  }
}

/**
 * Vérification d'une demande par un agent AfriMove. Ces routes n'existent pas dans les contrats : ils
 * décrivent ce que voit le candidat, pas le travail de l'agent.
 */
@ApiTags("Livraison moto · agents AfriMove")
@Controller("partenaires/livreurs/demandes")
export class AgentsLivreursController {
  constructor(private readonly inscription: InscriptionLivreurService) {}

  @Roles("afrimove")
  @Post(":dossier/verification")
  @HttpCode(200)
  @ApiOperation({ summary: "Agent : cocher CNI et MoMo, permis et assurance, formation" })
  verification(
    @UtilisateurCourant() u: Utilisateur,
    @Param("dossier") dossier: string,
    @Body() corps: unknown,
  ) {
    return this.inscription.verifier(u, dossier, lireVerificationLivreur(corps));
  }

  @Roles("afrimove")
  @Post(":dossier/activation")
  @HttpCode(200)
  @ApiOperation({
    summary: "Agent : activer le livreur quand tout est vérifié (le compte reçoit le rôle livreur)",
  })
  activation(
    @UtilisateurCourant() u: Utilisateur,
    @Param("dossier") dossier: string,
    @Body() corps: unknown,
  ) {
    return this.inscription.activer(u, dossier, lireActivationLivreur(corps));
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
    return this.inscription.refuser(u, dossier, lireRefusLivreur(corps).motif);
  }
}
