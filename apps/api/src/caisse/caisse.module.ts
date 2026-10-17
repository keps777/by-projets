import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { VerrouillageMoisModule } from "../comptable/verrouillage.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { CaisseController } from "./caisse.controller";
import { CaisseService } from "./caisse.service";
import { JournalAgenceModule } from "./journal/journal.module";
import {
  AlertesPatronMemoire,
  GuichetsMemoire,
  MouvementsMemoire,
  ReglesMemoire,
  SessionsMemoire,
} from "./memoire";
import {
  AlertesPatronPrisma,
  GuichetsAgencePrisma,
  MouvementsCaissePrisma,
  ReglesAgencePrisma,
  SessionsCaissePrisma,
} from "./postgres";
import {
  AlertesPatron,
  GuichetsAgence,
  MouvementsCaisse,
  ReglesAgence,
  SessionsCaisse,
} from "./ports";
import { exigerStockageDurable } from "./stockage";

/** Une vérification toutes les minutes suffit : minuit ne se rate pas d'une minute. */
export const PERIODE_CLOTURE_AUTO_MS = 60_000;

/**
 * Planificateur de la clôture automatique de minuit. Il tourne dans le processus de l'API (pas de
 * dépendance à un ordonnanceur) ; plusieurs instances de l'API peuvent le lancer en même temps sans
 * risque, car la clôture est idempotente (identifiant d'événement déduit de la session) et la
 * transition « ouverte → clôturée » est atomique. Désactivé en test : les tests appellent
 * `CaisseService.cloturerLesSessionsDeMinuit()` eux-mêmes.
 */
@Injectable()
export class PlanificateurClotureAuto implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("PlanificateurClotureAuto");
  private minuteur: NodeJS.Timeout | null = null;

  constructor(
    private readonly caisse: CaisseService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.env === "test") return;
    this.minuteur = setInterval(() => {
      this.caisse.cloturerLesSessionsDeMinuit().catch((e: unknown) => {
        this.logger.error(`Clôture automatique : ${e instanceof Error ? e.message : String(e)}`);
      });
    }, PERIODE_CLOTURE_AUTO_MS);
    this.minuteur.unref();
  }

  onModuleDestroy(): void {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
  }
}

@Injectable()
export class VerificationStockageCaisse implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly sessions: SessionsCaisse,
    private readonly mouvements: MouvementsCaisse,
    private readonly guichets: GuichetsAgence,
    private readonly regles: ReglesAgence,
    private readonly alertes: AlertesPatron,
  ) {}

  onModuleInit(): void {
    exigerStockageDurable("CaisseModule", this.config, [
      ["SessionsCaisse", this.sessions],
      ["MouvementsCaisse", this.mouvements],
      ["GuichetsAgence", this.guichets],
      ["ReglesAgence", this.regles],
      ["AlertesPatron", this.alertes],
    ]);
  }
}

/**
 * Sessions de caisse (AM-164) : ouverture, comptage, clôture, clôture automatique de minuit, calcul du
 * cash attendu et de l'écart, journal signé.
 *
 * Dans `AppModule`. Les ports ont une version PostgreSQL (`postgres.ts`) et une version en mémoire,
 * choisies par `API_STOCKAGE` (voir `socle/db/stockage.ts`).
 */
@Module({
  imports: [JournalAgenceModule, VerrouillageMoisModule],
  controllers: [CaisseController],
  providers: [
    CaisseService,
    PlanificateurClotureAuto,
    VerificationStockageCaisse,
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: SessionsCaisse,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new SessionsCaissePrisma(prisma) : new SessionsMemoire(),
    },
    {
      provide: MouvementsCaisse,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new MouvementsCaissePrisma(prisma) : new MouvementsMemoire(),
    },
    {
      provide: GuichetsAgence,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new GuichetsAgencePrisma(prisma) : new GuichetsMemoire(),
    },
    {
      provide: ReglesAgence,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ReglesAgencePrisma(prisma) : new ReglesMemoire(),
    },
    {
      provide: AlertesPatron,
      inject: [CONFIG, PrismaService, Horloge],
      useFactory: (config: AppConfig, prisma: PrismaService, horloge: Horloge) =>
        stockageSurPostgres(config)
          ? new AlertesPatronPrisma(prisma, horloge)
          : new AlertesPatronMemoire(),
    },
  ],
  exports: [
    CaisseService,
    JournalAgenceModule,
    SessionsCaisse,
    MouvementsCaisse,
    GuichetsAgence,
    ReglesAgence,
    AlertesPatron,
  ],
})
export class CaisseModule {}
