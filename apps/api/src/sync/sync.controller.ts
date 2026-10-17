import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { LotInvalide } from "./protocole";
import { RejeuService, type ReponseLot } from "./rejeu.service";
import { ROLES_TERRAIN } from "./regles";
import type { AlerteSync } from "./ports";

@ApiTags("Synchronisation")
@Controller("sync")
export class SyncController {
  constructor(private readonly rejeu: RejeuService) {}

  @Roles(...ROLES_TERRAIN)
  @Post("evenements")
  @HttpCode(200)
  @ApiOperation({
    summary: "Appareil : envoyer la file d'événements (ou simplement prendre des nouvelles)",
    description:
      "Rejoue les événements dans l'ordre de la file de l'appareil, chacun acquitté seul " +
      "(`accepte`, `deja_recu`, `rejete`). Un lot vide renvoie la plage, la part de sièges hors " +
      "ligne, un éventuel déblocage et les billets « à replacer ».",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["appareilId", "envoyeA", "evenements"],
      properties: {
        appareilId: { type: "string" },
        envoyeA: { type: "string", format: "date-time" },
        evenements: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            required: ["ordre", "evenement", "signature"],
            properties: {
              ordre: { type: "integer", minimum: 1 },
              evenement: { type: "object" },
              signature: { type: "string" },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Accusé de chaque événement" })
  @ApiResponse({ status: 400, description: "Lot illisible" })
  @ApiResponse({ status: 404, description: "Appareil inconnu" })
  @ApiResponse({ status: 409, description: "Appareil sans clé enregistrée" })
  async evenements(
    @Body() corps: unknown,
    @UtilisateurCourant() utilisateur: Utilisateur,
  ): Promise<ReponseLot> {
    try {
      return await this.rejeu.recevoir(corps, utilisateur);
    } catch (e) {
      if (e instanceof LotInvalide) {
        throw new BadRequestException({ code: "LOT_INVALIDE", message: e.message });
      }
      throw e;
    }
  }

  @Roles(...ROLES_TERRAIN)
  @Put("appareils/:id/cle")
  @HttpCode(204)
  @ApiOperation({ summary: "Appareil : enregistrer sa clé publique (ECDSA P-256, JWK)" })
  @ApiBody({
    schema: { type: "object", required: ["cle"], properties: { cle: { type: "object" } } },
  })
  async enregistrerCle(
    @Param("id") id: string,
    @Body() corps: unknown,
    @UtilisateurCourant() utilisateur: Utilisateur,
  ): Promise<void> {
    await this.rejeu.enregistrerCle(id, (corps as { cle?: unknown } | null)?.cle, utilisateur);
  }

  @Roles("superviseur", "patron")
  @Get("alertes")
  @ApiOperation({
    summary: "Alertes de synchronisation de ma gare (superviseur) ou de ma compagnie (patron)",
    description:
      "Billets « à replacer », numéros en double ou hors plage, files avec un trou, horloge en avance…",
  })
  alertes(@UtilisateurCourant() utilisateur: Utilisateur): Promise<AlerteSync[]> {
    return this.rejeu.listerAlertes(utilisateur);
  }
}
