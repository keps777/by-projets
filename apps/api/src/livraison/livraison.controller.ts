import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public, Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { LivraisonService } from "./livraison.service";
import { LivreursService } from "./livreurs.service";
import { MissionsService } from "./missions.service";
import {
  lireAdresse,
  lireDisponibilite,
  lireIdMission,
  lireInvitation,
  lirePartage,
  lireRemiseLivreur,
  lireRetraitGains,
} from "./validation";

/**
 * La livraison moto côté voyageur (planche « Livraison ») : l'écran de la course en cours, le partage
 * du suivi, le changement d'adresse. Opérations : `colis.livraison`, `colis.livraison.partager`,
 * `colis.livraison.adresse`. Le suivi en direct (`colis.livraison.position`) est un canal WebSocket,
 * à brancher sur `LivraisonService.suivreEnDirect`.
 */
@ApiTags("Livraison moto · voyageur")
@Controller("colis")
export class LivraisonVoyageurController {
  constructor(private readonly livraison: LivraisonService) {}

  @Roles("voyageur")
  @Get(":colisId/livraison")
  @ApiOperation({
    summary: "Expéditeur ou destinataire : la livraison moto en cours, avec le code à donner",
  })
  lire(@UtilisateurCourant() u: Utilisateur, @Param("colisId") colisId: string) {
    return this.livraison.livraison(u, colisId);
  }

  @Roles("voyageur")
  @Post(":colisId/livraison/partage")
  @ApiOperation({
    summary: "Partager le suivi de la livraison par SMS (lien public sans code, 24 h)",
  })
  partager(
    @UtilisateurCourant() u: Utilisateur,
    @Param("colisId") colisId: string,
    @Body() corps: unknown,
  ) {
    return this.livraison.partager(u, colisId, lirePartage(corps).destinataire);
  }

  @Roles("voyageur")
  @Put(":colisId/livraison/adresse")
  @ApiOperation({ summary: "Changer l'adresse de livraison (le livreur est prévenu)" })
  adresse(
    @UtilisateurCourant() u: Utilisateur,
    @Param("colisId") colisId: string,
    @Body() corps: unknown,
  ) {
    return this.livraison.changerAdresse(u, colisId, lireAdresse(corps).adresse);
  }
}

/**
 * Le suivi public d'un lien partagé : sans compte, mais avec un jeton long et aléatoire. Il ne montre ni
 * le code, ni les noms, ni l'adresse.
 */
@ApiTags("Livraison moto · suivi public")
@Controller("suivi")
export class SuiviPublicController {
  constructor(private readonly livraison: LivraisonService) {}

  @Public()
  @Get(":jeton")
  @ApiOperation({
    summary: "Public : où en est la livraison partagée (position du livreur, jamais le code)",
  })
  suivi(@Param("jeton") jeton: string) {
    return this.livraison.suiviPublic(jeton);
  }
}

/**
 * L'app du livreur (planche « Livreur »), rôle `livreur`. La remise exige le code du client, sa pièce
 * et la photo du colis ; trois codes faux bloquent le colis (423). Le canal des missions en direct
 * (`livreur.missions`) est un WebSocket, à brancher sur `LivreursService.suivreMissions`.
 */
@ApiTags("Livraison moto · app du livreur")
@Controller("livreurs/moi")
export class LivreurController {
  constructor(
    private readonly livreurs: LivreursService,
    private readonly missions: MissionsService,
  ) {}

  @Roles("livreur")
  @Get()
  @ApiOperation({ summary: "Livreur : mon espace (mission proposée, bilan, pièces, solde)" })
  espace(@UtilisateurCourant() u: Utilisateur) {
    return this.livreurs.espace(u);
  }

  @Roles("livreur")
  @Get("missions/en-cours")
  @ApiOperation({
    summary:
      "Livreur : retrouver la mission acceptée en cours (hors contrat, pour reprendre après une coupure)",
  })
  enCours(@UtilisateurCourant() u: Utilisateur) {
    return this.livreurs.missionEnCours(u);
  }

  @Roles("livreur")
  @Put("disponibilite")
  @ApiOperation({ summary: "Livreur : se mettre en ligne ou hors ligne" })
  disponibilite(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.livreurs.disponibilite(u, lireDisponibilite(corps).disponible);
  }

  @Roles("livreur")
  @Post("missions/:missionId/acceptation")
  @HttpCode(200)
  @ApiOperation({ summary: "Livreur : accepter la mission dans les 30 secondes" })
  accepter(@UtilisateurCourant() u: Utilisateur, @Param("missionId") missionId: string) {
    return this.missions.accepter(u, lireIdMission(missionId));
  }

  @Roles("livreur")
  @Post("missions/:missionId/refus")
  @HttpCode(200)
  @ApiOperation({ summary: "Livreur : passer la mission (elle va au livreur suivant)" })
  passer(@UtilisateurCourant() u: Utilisateur, @Param("missionId") missionId: string) {
    return this.missions.passer(u, lireIdMission(missionId));
  }

  @Roles("livreur")
  @Post("missions/:missionId/remise")
  @HttpCode(200)
  @ApiOperation({
    summary: "Livreur : remettre le colis contre le code du client, sa pièce et la photo",
    description:
      "Jamais de remise sans code valide : un code faux répond 422 (essais restants), le troisième " +
      "bloque le colis (423) jusqu'à l'intervention d'un superviseur. Le gain n'est crédité qu'après " +
      "une remise réussie.",
  })
  remettre(
    @UtilisateurCourant() u: Utilisateur,
    @Param("missionId") missionId: string,
    @Body() corps: unknown,
  ) {
    const remise = lireRemiseLivreur(corps);
    return this.missions.remettre(u, { missionId: lireIdMission(missionId), ...remise });
  }

  @Roles("livreur")
  @Post("missions/:missionId/absence")
  @HttpCode(200)
  @ApiOperation({
    summary: "Livreur : destinataire absent (10 minutes d'attente, puis dépôt au relais)",
  })
  absence(@UtilisateurCourant() u: Utilisateur, @Param("missionId") missionId: string) {
    return this.missions.signalerAbsence(u, lireIdMission(missionId));
  }

  @Roles("livreur")
  @Post("retraits")
  @HttpCode(200)
  @ApiOperation({ summary: "Livreur : retirer ses gains vers son MoMo (dès 5 000 F)" })
  retirer(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.livreurs.retirer(u, lireRetraitGains(corps).montant);
  }

  @Roles("livreur")
  @Post("invitations")
  @HttpCode(200)
  @ApiOperation({ summary: "Livreur : inviter un proche à devenir livreur (5 par jour au plus)" })
  inviter(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.livreurs.inviter(u, lireInvitation(corps).telephone);
  }
}
