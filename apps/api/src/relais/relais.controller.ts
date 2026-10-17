import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { RelaisService } from "./relais.service";
import { lireChoixRelais, lireReception, lireRemiseRelais } from "./validation";

/**
 * Points relais côté voyageur (planche « Relais ») : trouver les points relais proches du destinataire
 * et en choisir un. Noms d'opérations de `packages/api-client/src/colis/operations.ts` :
 * `colis.relais-proches` et `colis.choisir-relais`.
 */
@ApiTags("Points relais · voyageur")
@Controller("colis")
export class RelaisVoyageurController {
  constructor(private readonly relais: RelaisService) {}

  @Roles("voyageur")
  @Get(":colisId/relais")
  @ApiOperation({
    summary:
      "Expéditeur : les points relais de la ville du destinataire, du plus proche au plus loin",
  })
  proches(
    @UtilisateurCourant() u: Utilisateur,
    @Param("colisId") colisId: string,
    @Query("q") q?: string,
  ) {
    return this.relais.proches(u, colisId, q && q.length > 0 ? q.slice(0, 100) : undefined);
  }

  @Roles("voyageur")
  @Put(":colisId/relais")
  @ApiOperation({ summary: "Expéditeur : choisir le point relais (le destinataire est prévenu)" })
  choisir(
    @UtilisateurCourant() u: Utilisateur,
    @Param("colisId") colisId: string,
    @Body() corps: unknown,
  ) {
    return this.relais.choisir(u, colisId, lireChoixRelais(corps).relaisId);
  }
}

/**
 * L'app du point relais (planche « RelaisApp »), rôle `relais` : `relais.espace`, `relais.colis`,
 * `relais.recevoir`, `relais.remettre`. La remise exige le code du client, sa pièce et la photo du colis ;
 * trois codes faux bloquent le colis (423).
 */
@ApiTags("Points relais · app du relais")
@Controller("relais/moi")
export class RelaisAppController {
  constructor(private readonly relais: RelaisService) {}

  @Roles("relais")
  @Get()
  @ApiOperation({
    summary: "Relais : mon espace (colis en garde, gains de la semaine, remise en cours)",
  })
  espace(@UtilisateurCourant() u: Utilisateur) {
    return this.relais.espace(u);
  }

  @Roles("relais")
  @Get("colis/:colisId")
  @ApiOperation({
    summary: "Relais : retrouver un colis par son identifiant ou le numéro de son étiquette",
  })
  colis(@UtilisateurCourant() u: Utilisateur, @Param("colisId") colisId: string) {
    return this.relais.colisParScan(u, colisId);
  }

  @Roles("relais")
  @Post("receptions")
  @HttpCode(200)
  @ApiOperation({ summary: "Relais : recevoir un colis (scan de l'étiquette à l'arrivée)" })
  recevoir(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.relais.recevoir(u, lireReception(corps).numeroColis);
  }

  @Roles("relais")
  @Post("remises")
  @HttpCode(200)
  @ApiOperation({
    summary: "Relais : remettre un colis contre le code du client, sa pièce et la photo",
    description:
      "Jamais de remise sans code valide : un code faux répond 422 (essais restants), le troisième " +
      "bloque le colis (423) jusqu'à l'intervention d'un superviseur. Le gain de 200 F n'est crédité " +
      "qu'après une remise réussie.",
  })
  remettre(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.relais.remettre(u, lireRemiseRelais(corps));
  }
}
