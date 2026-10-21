import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import {
  CodeSmsDto,
  ConnexionDirectionDto,
  ConnexionPinDto,
  DefiReponse,
  JetonReponse,
  MoiReponse,
} from "./auth.dto";
import { Authentifie, Public, UtilisateurCourant, type Utilisateur } from "./decorateurs";
import { ROLES_ESPACE_PATRON, ROLES_VENTE } from "./roles";

/**
 * 10 essais par minute et par adresse : la vraie limite (3 essais puis blocage) est dans le service.
 * La connexion du voyageur n'est pas ici : elle est dans `src/auth-voyageur` (`/voyageur/connexion/*`).
 */
const LIMITE_CONNEXION = { default: { limit: 10, ttl: 60_000 } };

@ApiTags("Authentification")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(LIMITE_CONNEXION)
  @Post("guichet/connexion")
  @HttpCode(200)
  @ApiOperation({
    summary: "Guichetier et rôles terrain : numéro + PIN à 6 chiffres",
    description: "3 essais ratés bloquent le compte 15 minutes (423).",
  })
  @ApiResponse({ status: 200, type: JetonReponse })
  @ApiResponse({ status: 401, description: "Identifiants invalides" })
  @ApiResponse({ status: 423, description: "Compte bloqué" })
  connecterParPin(@Body() dto: ConnexionPinDto): Promise<JetonReponse> {
    return this.auth.connecterParPin(dto.telephone, dto.pin, dto.role);
  }

  @Public()
  @Throttle(LIMITE_CONNEXION)
  @Post("direction/connexion")
  @HttpCode(202)
  @ApiOperation({
    summary: "Superviseur, patron, comptable, AfriMove : mot de passe (étape 1), code SMS envoyé",
  })
  @ApiResponse({ status: 202, type: DefiReponse })
  @ApiResponse({ status: 401, description: "Identifiants invalides" })
  @ApiResponse({ status: 423, description: "Compte bloqué" })
  connecterDirection(@Body() dto: ConnexionDirectionDto): Promise<DefiReponse> {
    return this.auth.connecterDirection(dto.telephone, dto.motDePasse, dto.role);
  }

  @Public()
  @Throttle(LIMITE_CONNEXION)
  @Post("direction/verification")
  @HttpCode(200)
  @ApiOperation({ summary: "Superviseur, patron, comptable, AfriMove : code SMS (étape 2)" })
  @ApiResponse({ status: 200, type: JetonReponse })
  @ApiResponse({ status: 401, description: "Code invalide ou expiré" })
  verifierCodeDirection(@Body() dto: CodeSmsDto): Promise<JetonReponse> {
    return this.auth.verifierCodeDirection(dto.defiId, dto.code);
  }
}

@ApiTags("Authentification")
@Controller()
export class MoiController {
  @Authentifie()
  @Get("me")
  @ApiOperation({ summary: "Qui suis-je : rôle actif et habilitations" })
  @ApiResponse({ status: 200, type: MoiReponse })
  moi(@UtilisateurCourant() u: Utilisateur): MoiReponse {
    return {
      id: u.id,
      role: u.role,
      compagnieId: u.compagnieId,
      gareId: u.gareId,
      peutVendre: (ROLES_VENTE as readonly string[]).includes(u.role),
      accesPatron: (ROLES_ESPACE_PATRON as readonly string[]).includes(u.role),
    };
  }
}
