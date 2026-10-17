import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { LiensService } from "./liens.service";
import { PaiementsService } from "./paiements.service";
import { corps, lireLienProche, lirePayerCommande } from "./requetes";
import { vuePaiement } from "./vues";

/**
 * Paiement côté voyageur. Les chemins sont ceux du client d'API
 * (`packages/api-client/src/voyageur/operations.ts` : moyens, payer, statut, lien pour un proche) et
 * chaque réponse suit un schéma de `@afrimove/contrats` (`voyageur`).
 */
@ApiTags("Paiements : voyageur")
@Controller("voyageur")
export class PaiementsVoyageurController {
  constructor(
    private readonly paiements: PaiementsService,
    private readonly liens: LiensService,
  ) {}

  @Roles("voyageur")
  @Get("paiements/moyens")
  @ApiOperation({
    summary: "Moyens de paiement proposés (vide si le paiement en ligne est indisponible)",
    description:
      "MTN Mobile Money, Orange Money, carte, « demander à un proche ». En mode dégradé la liste est " +
      "vide : l'écran lit `GET /paiements/mode` et propose le paiement à la gare.",
  })
  moyens(@UtilisateurCourant() u: Utilisateur) {
    return this.paiements.moyens(u);
  }

  @Roles("voyageur")
  @Post("commandes/:commandeId/paiements")
  @HttpCode(201)
  @ApiOperation({
    summary: "Payer une commande (MTN MoMo, Orange Money, carte)",
    description:
      "MoMo et Orange Money : le numéro reçoit une demande de confirmation (par défaut, celui du " +
      "compte). Carte : `jetonCarte` produit par le prestataire de paiement, jamais le numéro de " +
      "carte (422 `NUMERO_DE_CARTE_REFUSE`). Rejouer la demande rend le paiement en cours ; un autre " +
      "moyen est refusé tant qu'il n'a pas abouti (409 `PAIEMENT_EN_COURS`). 503 `MODE_DEGRADE` si " +
      "le paiement en ligne est coupé. Le statut se suit avec `GET /voyageur/paiements/{id}`.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["moyen"],
      properties: {
        moyen: { type: "string", enum: ["mtn_momo", "orange_money", "carte"] },
        telephone: { type: "string", example: "+237691221008" },
        jetonCarte: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 503, description: "Paiement en ligne indisponible (mode dégradé)" })
  async payer(
    @Param("commandeId") commandeId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const demande = corps(lirePayerCommande, brut);
    return vuePaiement(await this.paiements.payerCommande(u, commandeId, demande));
  }

  @Roles("voyageur")
  @Get("paiements/:paiementId")
  @ApiOperation({ summary: "Statut d'un paiement du voyageur" })
  async statut(@Param("paiementId") paiementId: string, @UtilisateurCourant() u: Utilisateur) {
    return vuePaiement(await this.paiements.statut(u, paiementId));
  }

  @Roles("voyageur")
  @Post("commandes/:commandeId/lien-proche")
  @HttpCode(201)
  @ApiOperation({
    summary: "Demander à un proche de payer : lien de paiement",
    description:
      "Crée un lien valable aussi longtemps que la commande (15 minutes) ; un nouveau lien révoque " +
      "le précédent. Avec `procheId` ou `telephone`, le lien part par SMS (`envoyeA`).",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { procheId: { type: "string" }, telephone: { type: "string" } },
    },
  })
  lienProche(
    @Param("commandeId") commandeId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    return this.liens.creer(u, commandeId, corps(lireLienProche, brut ?? {}));
  }
}
