import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { AssistantService } from "./assistant.service";
import type {
  ConversationVue,
  InsightsVue,
  PropositionAppliqueeVue,
  ReponseVue,
  ResultatSimulationVue,
} from "./modele";
import { lireDemandeSimulation, lireQuestion } from "./validation";

function compagnieDe(u: Utilisateur): string {
  if (u.compagnieId === null) {
    throw new ForbiddenException({ code: "HORS_PERIMETRE", message: "Compte sans compagnie" });
  }
  return u.compagnieId;
}

/**
 * L'assistant du patron (`/(patron)/assistant`, `/assistant/reponse`). Noms d'opérations de
 * `packages/api-client/src/patron/operations.ts` : `patron.assistant.insights`, `.conversation`, `.question`,
 * `.simuler`, `.appliquer`. Réservé au patron ; une compagnie ne lit que ses propres chiffres.
 */
@ApiTags("Assistant")
@Controller("patron/assistant")
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Roles("patron")
  @Get("insights")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.assistant.insights",
    summary: "Argent qui fuit, argent à gagner et questions suggérées",
    description:
      "Réponse conforme au contrat `InsightsAssistant`. Chaque action montrée est enregistrée : " +
      "le patron ne peut appliquer que ce que l'API lui a proposé.",
  })
  @ApiResponse({ status: 503, description: "Chiffres indisponibles (SOURCE_INDISPONIBLE)" })
  insights(@UtilisateurCourant() u: Utilisateur): Promise<InsightsVue> {
    return this.assistant.insights(compagnieDe(u));
  }

  @Roles("patron")
  @Get("conversation")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.assistant.conversation",
    summary: "Les derniers échanges de ce patron avec l'assistant",
    description: "Réponse conforme au contrat `ConversationAssistant`.",
  })
  conversation(@UtilisateurCourant() u: Utilisateur): Promise<ConversationVue> {
    return this.assistant.conversation(compagnieDe(u), u.id);
  }

  @Roles("patron")
  @Post("questions")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.assistant.question",
    summary: "Question libre en français",
    description:
      "Corps `{ question }` (de 1 à 500 caractères). Réponse conforme au contrat `ReponseAssistant`, " +
      "chiffres calculés par l'API, sources citées. 429 `TROP_DE_QUESTIONS` au-delà de la limite par minute.",
  })
  @ApiResponse({ status: 400, description: "Question invalide (REQUETE_INVALIDE)" })
  @ApiResponse({ status: 429, description: "Trop de questions (TROP_DE_QUESTIONS)" })
  question(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur): Promise<ReponseVue> {
    return this.assistant.poserQuestion(u, compagnieDe(u), lireQuestion(corps));
  }

  @Roles("patron")
  @Post("simulations")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.assistant.simuler",
    summary: "Simulation d'horaire ou de prix d'un départ",
    description:
      "Ne change rien (rejouable). Réponse conforme au contrat `ResultatSimulation`. " +
      "404 `DEPART_INTROUVABLE`, 422 `HORAIRE_EN_CONFLIT`, `DONNEES_INSUFFISANTES`, `SIMULATION_SANS_EFFET`.",
  })
  simuler(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<ResultatSimulationVue> {
    return this.assistant.simuler(compagnieDe(u), lireDemandeSimulation(corps));
  }

  @Roles("patron")
  @Post("propositions")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.assistant.appliquer",
    summary: "Appliquer une proposition de l'assistant (signature PIN)",
    description:
      "Corps `{ actionId, signature }`. Modifie un réglage : signature PIN obligatoire (401 `PIN_REQUIS`, " +
      "403 `PIN_INCORRECT`, 423 `PIN_BLOQUE`, 422 `SIGNATURE_PERIMEE`). 404 `PROPOSITION_INCONNUE`, " +
      "410 `PROPOSITION_PERIMEE`, 409 `PROPOSITION_DEJA_APPLIQUEE`, 422 `ACTION_NON_APPLICABLE`. " +
      "Réponse conforme au contrat `PropositionAppliquee` ; `journalId` est la ligne du journal d'audit.",
  })
  appliquer(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<PropositionAppliqueeVue> {
    return this.assistant.appliquer(u, compagnieDe(u), corps);
  }
}
