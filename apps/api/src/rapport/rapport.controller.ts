import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { RapportIntrouvable, RapportPasEncore } from "./erreurs";
import type { RapportSoir } from "./modele";
import { RapportSoirService } from "./rapport.service";
import { debutDeJour } from "./temps";

function requeteInvalide(message: string): never {
  throw new BadRequestException({ code: "REQUETE_INVALIDE", message });
}

/**
 * Le rapport du soir dans l'application du patron (`/(patron)/rapport`). Même contenu que le
 * message WhatsApp de 21 h : l'écran affiche ce que le patron a reçu.
 */
@ApiTags("Rapport du soir")
@Controller("patron/rapports")
export class RapportController {
  constructor(private readonly rapports: RapportSoirService) {}

  @Roles("patron")
  @Get("soir")
  @ApiOperation({
    operationId: "patron.rapport.soir",
    summary: "Rapport du soir : le message WhatsApp de 21 h et sa vue dans l'app",
    description:
      "Réponse conforme au contrat `RapportSoir` de `@afrimove/contrats`. Sans `jour` (AAAA-MM-JJ), " +
      "le dernier rapport dû : celui d'aujourd'hui à partir de 21:00, celui d'hier avant. Le rapport " +
      "est arrêté une fois pour toutes à 21:00 : une caisse validée plus tard ne le change pas.",
  })
  @ApiResponse({
    status: 404,
    description: "Rapport pas encore arrêté (RAPPORT_PAS_ENCORE) ou introuvable",
  })
  async soir(
    @Query() requete: Record<string, unknown>,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<RapportSoir> {
    const inconnus = Object.keys(requete).filter((cle) => cle !== "jour");
    if (inconnus.length > 0) return requeteInvalide(`Paramètres inconnus : ${inconnus.join(", ")}`);
    const brut = requete["jour"];
    if (brut !== undefined && (typeof brut !== "string" || !debutDeJour(brut))) {
      return requeteInvalide("jour : AAAA-MM-JJ attendu");
    }
    if (u.compagnieId === null) {
      throw new ForbiddenException({ code: "HORS_PERIMETRE", message: "Compte sans compagnie" });
    }
    try {
      return await this.rapports.pourLApp(u.compagnieId, brut);
    } catch (e) {
      if (e instanceof RapportPasEncore) {
        throw new NotFoundException({ code: "RAPPORT_PAS_ENCORE", message: e.message });
      }
      if (e instanceof RapportIntrouvable) {
        throw new NotFoundException({ code: "RAPPORT_INTROUVABLE", message: e.message });
      }
      throw e;
    }
  }
}
