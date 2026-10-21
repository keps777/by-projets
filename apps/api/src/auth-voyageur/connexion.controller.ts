import {
  Body,
  Catch,
  Controller,
  HttpCode,
  Post,
  UseFilters,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import type { voyageur } from "@afrimove/contrats";
import { Public } from "../socle/auth/decorateurs";
import { ConnexionVoyageurService } from "./connexion.service";
import { ReessayerPlusTard } from "./erreurs";
import { lireDemandeCode, lireVerification, ou400 } from "./validation";

/** 10 requêtes par minute et par adresse ; les vraies limites (par numéro) sont dans le service. */
const LIMITE_CONNEXION = { default: { limit: 10, ttl: 60_000 } };

/** Une attente imposée (429) dit aussi son temps dans l'en-tête `Retry-After`, en secondes. */
@Catch(ReessayerPlusTard)
export class FiltreReessai implements ExceptionFilter<ReessayerPlusTard> {
  catch(erreur: ReessayerPlusTard, hote: ArgumentsHost): void {
    const reponse = hote.switchToHttp().getResponse<Response>();
    reponse
      .status(erreur.getStatus())
      .setHeader("Retry-After", String(erreur.attenteSecondes))
      .json(erreur.getResponse());
  }
}

/**
 * Connexion du voyageur : numéro + code reçu par SMS (ou WhatsApp). Les chemins et les formes sont
 * ceux du contrat voyageur (`OP_DEMANDER_CODE` et `OP_VERIFIER_CODE` de `@afrimove/api-client`) :
 * `useDemanderCode` et `useVerifierCode` de la planche Connexion.
 */
@ApiTags("Connexion voyageur")
@Controller("voyageur/connexion")
@UseFilters(FiltreReessai)
export class ConnexionVoyageurController {
  constructor(private readonly connexion: ConnexionVoyageurService) {}

  @Public()
  @Throttle(LIMITE_CONNEXION)
  @Post("code")
  @HttpCode(200)
  @ApiOperation({
    summary: "Demander un code de connexion (SMS par défaut, WhatsApp en alternative)",
    description:
      "Un envoi toutes les 40 secondes et 5 par heure au plus pour un même numéro. Le SMS se termine " +
      "par `@<domaine> #<code>` (WebOTP). Même réponse que le numéro ait un compte ou non.",
  })
  @ApiBody({ schema: { type: "object", required: ["telephone"] } })
  @ApiResponse({ status: 400, description: "REQUETE_INVALIDE : numéro mal formé" })
  @ApiResponse({ status: 422, description: "CANAL_INDISPONIBLE ou NUMERO_NON_AUTORISE" })
  @ApiResponse({
    status: 429,
    description: "ENVOI_TROP_RAPPROCHE, TROP_DE_DEMANDES ou TROP_ESSAIS (en-tête Retry-After)",
  })
  @ApiResponse({ status: 503, description: "ENVOI_IMPOSSIBLE : le code n'a pas pu partir" })
  demanderCode(@Body() brut: unknown): Promise<voyageur.ReponseDemandeCode> {
    return this.connexion.demanderCode(ou400(() => lireDemandeCode(brut)));
  }

  @Public()
  @Throttle(LIMITE_CONNEXION)
  @Post("verification")
  @HttpCode(200)
  @ApiOperation({
    summary: "Vérifier le code et ouvrir la session (le compte est créé au premier code valide)",
    description:
      "5 mauvais codes bloquent le numéro (15 minutes, puis le double à chaque blocage, 24 h au " +
      "plus), même si un nouveau code est demandé entre-temps. Le code est à usage unique.",
  })
  @ApiBody({ schema: { type: "object", required: ["telephone", "code"] } })
  @ApiResponse({ status: 400, description: "REQUETE_INVALIDE : numéro ou code mal formé" })
  @ApiResponse({ status: 401, description: "CODE_INVALIDE (essaisRestants) ou CODE_EXPIRE" })
  @ApiResponse({ status: 429, description: "TROP_ESSAIS (en-tête Retry-After)" })
  verifierCode(@Body() brut: unknown): Promise<voyageur.SessionVoyageur> {
    return this.connexion.verifierCode(ou400(() => lireVerification(brut)));
  }
}
