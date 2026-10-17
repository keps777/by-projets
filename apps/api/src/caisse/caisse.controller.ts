import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { CaisseService } from "./caisse.service";
import { requeteInvalide } from "./erreurs";

const CORPS_EVENEMENT = {
  schema: {
    type: "object" as const,
    description:
      "Un événement de l'agence : { id (UUID créé sur l'appareil), type, at, appareilId, auteurId, cible, numeroPlage: null, donnees }.",
  },
};

/**
 * Les routes de la caisse, avec exactement les chemins et les noms d'opérations de
 * `packages/api-client/src/agence/operations.ts` :
 *
 * - `agence.caisse.session` → `GET /agence/caisse/session`
 * - `agence.caisse.ouverte` → `POST /agence/caisse/ouverture`
 * - `agence.caisse.comptee` → `POST /agence/caisse/comptage`
 * - `agence.caisse.cloturee` → `POST /agence/caisse/cloture`
 */
@ApiTags("Caisse")
@Controller("agence/caisse")
export class CaisseController {
  constructor(private readonly caisse: CaisseService) {}

  @Roles("guichetier", "superviseur")
  @Get("session")
  @ApiOperation({
    summary: "La session de caisse : ce que l'app a compté, ce que l'agent compte, l'écart",
    description:
      "Un guichetier lit sa caisse (celle qui est ouverte, sinon la dernière) ; un superviseur lit " +
      "celle qu'il nomme (`sessionId`) dans sa gare.",
  })
  async session(@Query("sessionId") sessionId: unknown, @UtilisateurCourant() u: Utilisateur) {
    if (sessionId !== undefined && (typeof sessionId !== "string" || sessionId.length === 0)) {
      throw requeteInvalide("PARAMETRES_INVALIDES", "« sessionId » : texte attendu");
    }
    return this.caisse.lire(sessionId as string | undefined, u);
  }

  @Roles("guichetier")
  @Post("ouverture")
  @HttpCode(200)
  @ApiOperation({
    summary: "Ouvrir la caisse avec le fond de caisse compté",
    description: "Événement `caisse.ouverte`. Idempotent par l'UUID de l'événement.",
  })
  @ApiBody(CORPS_EVENEMENT)
  @ApiResponse({ status: 409, description: "Une caisse est déjà ouverte (agent ou guichet)" })
  ouverture(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.caisse.ouvrir(corps, u);
  }

  @Roles("guichetier")
  @Post("comptage")
  @HttpCode(200)
  @ApiOperation({
    summary: "Compter la caisse : coupures puis pièces",
    description: "Événement `caisse.comptee`. Le total doit être celui des coupures et des pièces.",
  })
  @ApiBody(CORPS_EVENEMENT)
  comptage(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.caisse.compter(corps, u);
  }

  @Roles("guichetier")
  @Post("cloture")
  @HttpCode(200)
  @ApiOperation({
    summary: "Clôturer la caisse ; le superviseur la valide ensuite avec son PIN",
    description:
      "Événement `caisse.cloturee`. Le cash attendu est recalculé par le serveur ; l'écart est " +
      "compté − attendu, au franc près.",
  })
  @ApiBody(CORPS_EVENEMENT)
  cloture(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.caisse.cloturer(corps, u);
  }
}
