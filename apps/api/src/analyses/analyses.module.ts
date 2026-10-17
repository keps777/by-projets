import {
  Global,
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnModuleInit,
  type Provider,
} from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AnalysesController } from "./analyses.controller";
import { AnalysesService } from "./analyses.service";
import { CONFIG_ANALYSES, chargerConfigAnalyses, type ConfigAnalyses } from "./config";
import {
  FaitsCaisseMemoire,
  FaitsDepartsMemoire,
  OffresPubliquesMemoire,
  ReferentielMemoire,
  ReseauMemoire,
} from "./memoire";
import {
  FaitsCaissePrisma,
  FaitsDepartsPrisma,
  OffresPubliquesPrisma,
  ReferentielAnalysesPrisma,
  ReseauAnonymePrisma,
} from "./postgres";
import {
  FaitsCaisse,
  FaitsDeparts,
  OffresPubliques,
  ReferentielAnalyses,
  ReseauAnonyme,
  type Durable,
} from "./ports";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port des analyses est en mémoire (le patron
 * verrait des analyses vides, ou pire, celles d'un jeu d'essai).
 */
@Injectable()
export class VerificationAnalyses implements OnModuleInit {
  constructor(
    @Inject(CONFIG_ANALYSES) private readonly config: ConfigAnalyses,
    private readonly referentiel: ReferentielAnalyses,
    private readonly departs: FaitsDeparts,
    private readonly caisse: FaitsCaisse,
    private readonly offres: OffresPubliques,
    private readonly reseau: ReseauAnonyme,
  ) {}

  onModuleInit(): void {
    if (!this.config.production) return;
    const ports: Array<[string, Durable]> = [
      ["ReferentielAnalyses", this.referentiel],
      ["FaitsDeparts", this.departs],
      ["FaitsCaisse", this.caisse],
      ["OffresPubliques", this.offres],
      ["ReseauAnonyme", this.reseau],
    ];
    const volatils = ports.filter(([, port]) => !port.durable).map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `AnalysesModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs ` +
          "PostgreSQL (requêtes décrites dans apps/api/src/analyses/README.md) avant de démarrer en production.",
      );
    }
  }
}

/** Adaptateurs de production à brancher à la place de ceux en mémoire (voir `AnalysesModule.avec`). */
export interface AdaptateursAnalyses {
  /** Modules qui fournissent ce dont les adaptateurs ont besoin (Prisma…). */
  imports?: ModuleMetadata["imports"];
  /**
   * Fournisseurs qui remplacent ceux par défaut : `ReferentielAnalyses`, `FaitsDeparts`,
   * `FaitsCaisse`, `OffresPubliques`, `ReseauAnonyme`.
   */
  providers?: Provider[];
}

/**
 * Analyses du patron (AM-109) : agrégats (recette, remplissage, par ligne, bus, jour, heure, période),
 * règles de détection (écarts répétés d'un agent, pannes répétées, concurrent moins cher sur un créneau,
 * creux d'un jour, billets de cadence sans nom) et simulation d'horaire et de prix. Les trois routes
 * `GET /patron/analyses…` servent les écrans Analyses ; `AnalysesService` sert l'assistant.
 *
 * Dans `AppModule`. Il ne lit que par des ports (`ports.ts`), n'écrit rien et n'a pas de table à lui. Les
 * ports ont une version PostgreSQL (`postgres.ts`) et une version en mémoire, choisies par `API_STOCKAGE`
 * (voir `socle/db/stockage.ts`).
 *
 * Module global : `AnalysesService` est visible de l'assistant (et de tout module qui voudrait lire les
 * mêmes chiffres) sans second import. Un seul `AnalysesModule` (ou `AnalysesModule.avec`) dans `AppModule` :
 * un deuxième aurait ses propres ports, donc ses propres données.
 */
@Global()
@Module({
  controllers: [AnalysesController],
  providers: [
    {
      provide: CONFIG_ANALYSES,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigAnalyses =>
        chargerConfigAnalyses(process.env, config.env === "production"),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: ReferentielAnalyses,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new ReferentielAnalysesPrisma(prisma)
          : new ReferentielMemoire(),
    },
    {
      provide: FaitsDeparts,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new FaitsDepartsPrisma(prisma) : new FaitsDepartsMemoire(),
    },
    {
      provide: FaitsCaisse,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new FaitsCaissePrisma(prisma) : new FaitsCaisseMemoire(),
    },
    {
      provide: OffresPubliques,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new OffresPubliquesPrisma(prisma)
          : new OffresPubliquesMemoire(),
    },
    {
      provide: ReseauAnonyme,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ReseauAnonymePrisma(prisma) : new ReseauMemoire(),
    },
    AnalysesService,
    VerificationAnalyses,
  ],
  exports: [
    AnalysesService,
    CONFIG_ANALYSES,
    ReferentielAnalyses,
    FaitsDeparts,
    FaitsCaisse,
    OffresPubliques,
    ReseauAnonyme,
  ],
})
export class AnalysesModule {
  /** Le module avec des adaptateurs de production : les fournisseurs donnés remplacent ceux par défaut. */
  static avec(adaptateurs: AdaptateursAnalyses): DynamicModule {
    return {
      module: AnalysesModule,
      imports: adaptateurs.imports ?? [],
      providers: adaptateurs.providers ?? [],
    };
  }
}
