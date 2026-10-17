import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnModuleInit,
  type Provider,
} from "@nestjs/common";
import type { Durable } from "../analyses/ports";
import { VerificateurSignature } from "../modules/signature";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AssistantRapportMoteur } from "./assistant-rapport";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";
import { CONFIG_ASSISTANT, chargerConfigAssistant, type ConfigAssistant } from "./config";
import { AppliquerActionsMemoire, ConversationsMemoire, PropositionsMemoire } from "./memoire";
import { ModeleAucun, ModeleClaude, TransportClaude, TransportFetch } from "./modele-langage";
import { ConversationsPrisma, PropositionsPrisma } from "./postgres";
import {
  AppliquerActions,
  ConversationsAssistant,
  ModeleLangage,
  PropositionsAssistant,
} from "./ports";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port de l'assistant est en mémoire (les
 * conversations et les propositions seraient perdues au redémarrage, et les réglages acceptés par le
 * patron ne seraient appliqués nulle part). Sans clé Anthropic, l'assistant démarre : les règles de
 * l'API répondent seules (un avertissement le dit).
 */
@Injectable()
export class VerificationAssistant implements OnModuleInit {
  private readonly journal = new Logger("Assistant");

  constructor(
    @Inject(CONFIG_ASSISTANT) private readonly config: ConfigAssistant,
    private readonly conversations: ConversationsAssistant,
    private readonly propositions: PropositionsAssistant,
    private readonly appliquer: AppliquerActions,
    private readonly modele: ModeleLangage,
  ) {}

  onModuleInit(): void {
    if (!this.config.production) return;
    const ports: Array<[string, Durable]> = [
      ["ConversationsAssistant", this.conversations],
      ["PropositionsAssistant", this.propositions],
      ["AppliquerActions", this.appliquer],
    ];
    const volatils = ports.filter(([, port]) => !port.durable).map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `AssistantModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs ` +
          "PostgreSQL et le planning (voir apps/api/src/assistant/README.md) avant de démarrer en production.",
      );
    }
    if (!this.modele.actif) {
      this.journal.warn(
        "Aucun modèle de langage configuré (ANTHROPIC_API_KEY) : l'assistant répond avec les seules règles de l'API.",
      );
    }
  }
}

/** Adaptateurs de production à brancher à la place de ceux en mémoire (voir `AssistantModule.avec`). */
export interface AdaptateursAssistant {
  imports?: ModuleMetadata["imports"];
  /**
   * Fournisseurs qui remplacent ceux par défaut : `ConversationsAssistant`, `PropositionsAssistant`,
   * `AppliquerActions`, et au besoin `ModeleLangage` ou `TransportClaude`.
   */
  providers?: Provider[];
}

/**
 * Assistant du patron (AM-109) : insights (argent qui fuit, argent à gagner), questions libres en français,
 * simulations d'horaire et de prix, et application des propositions sur signature PIN. Les chiffres sont
 * ceux du module `analyses` (global : un seul `AnalysesModule` dans l'application) ; le modèle de
 * langage (Claude) ne fait que reformuler des phrases que l'API a calculées, et chaque nombre de sa
 * réponse est vérifié.
 *
 * Dans `AppModule`. Les conversations et les propositions ont leur version PostgreSQL (`postgres.ts`),
 * choisie par `API_STOCKAGE`. `AppliquerActions` reste simulé tant que le planning n'existe pas : en
 * production, le garde-fou ci-dessus refuse alors de démarrer (voir README). `AssistantRapport` est
 * fourni au module rapport par `AppModule` (`AssistantRapportMoteur`).
 */
@Module({
  controllers: [AssistantController],
  providers: [
    {
      provide: CONFIG_ASSISTANT,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigAssistant =>
        chargerConfigAssistant(process.env, config.env === "production"),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: ConversationsAssistant,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ConversationsPrisma(prisma) : new ConversationsMemoire(),
    },
    {
      provide: PropositionsAssistant,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new PropositionsPrisma(prisma) : new PropositionsMemoire(),
    },
    // Reste simulé : le planning (qui applique les réglages acceptés) n'existe pas encore.
    { provide: AppliquerActions, useClass: AppliquerActionsMemoire },
    { provide: TransportClaude, useClass: TransportFetch },
    {
      provide: ModeleLangage,
      inject: [CONFIG_ASSISTANT, TransportClaude],
      useFactory: (config: ConfigAssistant, transport: TransportClaude): ModeleLangage =>
        config.modele.fournisseur === "claude"
          ? new ModeleClaude(config.modele, transport)
          : new ModeleAucun(),
    },
    VerificateurSignature,
    AssistantService,
    AssistantRapportMoteur,
    VerificationAssistant,
  ],
  exports: [
    AssistantService,
    AssistantRapportMoteur,
    CONFIG_ASSISTANT,
    ConversationsAssistant,
    PropositionsAssistant,
    AppliquerActions,
    ModeleLangage,
  ],
})
export class AssistantModule {
  /** Le module avec des adaptateurs de production : les fournisseurs donnés remplacent ceux par défaut. */
  static avec(adaptateurs: AdaptateursAssistant): DynamicModule {
    return {
      module: AssistantModule,
      imports: adaptateurs.imports ?? [],
      providers: adaptateurs.providers ?? [],
    };
  }
}
