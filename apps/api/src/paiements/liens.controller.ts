import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../socle/auth/decorateurs";
import { LiensService } from "./liens.service";
import { corps, lirePayerCommande } from "./requetes";
import { vuePaiement } from "./vues";

/**
 * Le proche qui a reçu le lien : pas de compte, pas de jeton d'accès. Le jeton du lien (256 bits,
 * seule son empreinte est gardée) donne accès à l'aperçu d'une commande et à son paiement, rien
 * d'autre. Les routes restent soumises à la limitation de débit par adresse.
 */
@ApiTags("Paiements : lien d'un proche")
@Controller("paiements/liens")
export class LiensPaiementController {
  constructor(private readonly liens: LiensService) {}

  @Public()
  @Get(":jeton")
  @ApiOperation({
    summary: "Aperçu de la commande d'un lien de paiement",
    description:
      "Trajet, lignes, total, prénom du voyageur. 404 `LIEN_INCONNU` (inconnu ou remplacé), 410 " +
      "`LIEN_EXPIRE` pour un lien périmé sur `POST`.",
  })
  apercu(@Param("jeton") jeton: string) {
    return this.liens.apercu(jeton);
  }

  @Public()
  @Post(":jeton/paiements")
  @HttpCode(201)
  @ApiOperation({ summary: "Payer la commande du voyageur depuis le lien" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["moyen", "telephone"],
      properties: {
        moyen: { type: "string", enum: ["mtn_momo", "orange_money", "carte"] },
        telephone: { type: "string", example: "+237691221008" },
        jetonCarte: { type: "string" },
      },
    },
  })
  async payer(@Param("jeton") jeton: string, @Body() brut: unknown) {
    return vuePaiement(await this.liens.payer(jeton, corps(lirePayerCommande, brut)));
  }

  @Public()
  @Get(":jeton/paiements/:paiementId")
  @ApiOperation({ summary: "Statut du paiement fait depuis le lien" })
  async statut(@Param("jeton") jeton: string, @Param("paiementId") paiementId: string) {
    return vuePaiement(await this.liens.statutPaiement(jeton, paiementId));
  }
}
