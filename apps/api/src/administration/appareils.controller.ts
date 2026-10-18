import { Body, Controller, Get, Header, Headers, HttpCode, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../socle/auth/decorateurs";
import { KiosqueService, type EnrolementReponse, type OrdreReponse } from "./kiosque.service";

/**
 * Routes lues par le téléphone lui-même (aucun compte n'y est connecté). Chacune prouve l'appareil par un secret :
 * le code d'enrôlement (une fois), le secret de l'appareil (lecture des ordres), le secret d'acquittement (accusé).
 * Les formes sont celles que `apps/web/src/kiosque/canal.ts` attend.
 */
@ApiTags("Appareils")
@Controller("appareils")
@Public()
export class AppareilsController {
  constructor(private readonly kiosque: KiosqueService) {}

  @Post("enrolement")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Enrôler un téléphone avec le code donné par l'administration",
    description:
      "Corps `{ code }`. Répond `{ appareilId, secret, compagnieId, gareId, libelle, agence, gare, genre, rang, plage }` : le secret n'est donné qu'une fois, " +
      "l'appareil le garde et le présente ensuite en `Authorization: Bearer`.",
  })
  @ApiResponse({ status: 404, description: "Code inconnu ou déjà utilisé (`CODE_INCONNU`)" })
  @ApiResponse({ status: 410, description: "Code expiré (`CODE_EXPIRE`)" })
  enroler(@Body() corps: unknown): Promise<EnrolementReponse> {
    return this.kiosque.enroler(corps);
  }

  @Get(":id/commande")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "L'appareil lit son prochain ordre (effacement à distance)",
    description:
      '`Authorization: Bearer <secret de l\'appareil>`. Répond `{ commande: { id, type: "effacer", emiseA, secretAcquittement } | null }`.',
  })
  @ApiResponse({
    status: 401,
    description: "Appareil non authentifié (`APPAREIL_NON_AUTHENTIFIE`)",
  })
  commande(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
  ): Promise<{ commande: OrdreReponse | null }> {
    return this.kiosque.prochaineCommande(id, authorization);
  }

  @Post(":id/commandes/:commandeId/acquittement")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "L'appareil acquitte l'effacement (rapport d'effacement)",
    description:
      "`Authorization: Bearer <secretAcquittement>` donné avec l'ordre. Corps `{ effaceA, complet, etapes[] }`. " +
      "L'accusé ne s'écrit qu'une fois : le second répond 409. Le secret de l'appareil est révoqué.",
  })
  @ApiResponse({ status: 401, description: "Secret d'acquittement invalide" })
  @ApiResponse({ status: 404, description: "Ordre inconnu" })
  @ApiResponse({ status: 409, description: "Déjà acquitté (`DEJA_ACQUITTEE`)" })
  acquitter(
    @Param("id") id: string,
    @Param("commandeId") commandeId: string,
    @Body() corps: unknown,
    @Headers("authorization") authorization?: string,
  ): Promise<{ enregistre: true }> {
    return this.kiosque.acquitter(id, commandeId, authorization, corps);
  }
}
