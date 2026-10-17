import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { VerrouillageMoisModule } from "../comptable/verrouillage.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { NumerotationModule } from "../numerotation/numerotation.module";
import {
  AlertesMemoire,
  AppareilsMemoire,
  JournalMemoire,
  ProvisionnementMemoire,
  SiegesMemoire,
  type StockageSync,
} from "./memoire";
import {
  AlertesSyncPrisma,
  AppareilsSyncPrisma,
  JournalSyncPrisma,
  ProvisionnementVide,
  SiegesSyncPrisma,
} from "./postgres";
import {
  AlertesSync,
  AppareilsSync,
  ControleNumeros,
  JournalSync,
  ProvisionnementSync,
  SiegesSync,
} from "./ports";
import { RejeuService } from "./rejeu.service";
import { SyncController } from "./sync.controller";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port de la synchronisation est encore
 * branché sur la mémoire (les événements reçus seraient perdus au premier redémarrage).
 */
@Injectable()
export class VerificationStockageSync implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly appareils: AppareilsSync,
    private readonly journal: JournalSync,
    private readonly sieges: SiegesSync,
    private readonly alertes: AlertesSync,
    private readonly numeros: ControleNumeros,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["AppareilsSync", this.appareils],
      ["JournalSync", this.journal],
      ["SiegesSync", this.sieges],
      ["AlertesSync", this.alertes],
      ["ControleNumeros", this.numeros],
    ];
    const volatils = ports
      .filter(([, port]) => (port as Partial<StockageSync>).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `SyncModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs PostgreSQL ` +
          "(tables à créer dans apps/api/prisma) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Moteur de synchronisation côté serveur (AM-160) : réception idempotente par UUID, rejeu dans
 * l'ordre, détection des conflits de sièges.
 *
 * Importé par `AppModule`. Les ports ci-dessous sont remplaçables : AM-161 fournit
 * `ControleNumeros` et `AttributionPlages` ; les adaptateurs PostgreSQL (`postgres.ts`) remplacent
 * les versions en mémoire en production ou avec `API_STOCKAGE=postgres`.
 */
@Module({
  imports: [NumerotationModule, VerrouillageMoisModule],
  controllers: [SyncController],
  providers: [
    RejeuService,
    VerificationStockageSync,
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: AppareilsSync,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new AppareilsSyncPrisma(prisma) : new AppareilsMemoire(),
    },
    {
      provide: JournalSync,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new JournalSyncPrisma(prisma) : new JournalMemoire(),
    },
    {
      provide: SiegesSync,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new SiegesSyncPrisma(prisma) : new SiegesMemoire(),
    },
    {
      provide: AlertesSync,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new AlertesSyncPrisma(prisma) : new AlertesMemoire(),
    },
    {
      provide: ProvisionnementSync,
      inject: [CONFIG],
      useFactory: (config: AppConfig) =>
        stockageSurPostgres(config) ? new ProvisionnementVide() : new ProvisionnementMemoire(),
    },
  ],
  exports: [
    RejeuService,
    AppareilsSync,
    JournalSync,
    SiegesSync,
    AlertesSync,
    ProvisionnementSync,
    // `ControleNumeros` et `AttributionPlages` viennent de la numérotation (AM-161) : Nest ne
    // réexporte pas un jeton importé, on réexporte donc le module qui les fournit.
    NumerotationModule,
  ],
})
export class SyncModule {}
