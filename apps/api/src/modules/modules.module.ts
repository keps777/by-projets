import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { GardeModule } from "./garde-module";
import { AnnuaireMemoire, DetailsAucun, ReglagesMemoire, type StockageModules } from "./memoire";
import { ModulesController } from "./modules.controller";
import { ModulesService } from "./modules.service";
import { AnnuaireAgencesPrisma, ReglagesModulesPrisma } from "./postgres";
import { AnnuaireAgences, DetailsModules, ReglagesModules } from "./ports";
import { VerificateurSignature } from "./signature";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port est encore branché sur la mémoire
 * (les réglages des agences seraient perdus au premier redémarrage).
 */
@Injectable()
export class VerificationStockageModules implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly reglages: ReglagesModules,
    private readonly annuaire: AnnuaireAgences,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const volatils = (
      [
        ["ReglagesModules", this.reglages],
        ["AnnuaireAgences", this.annuaire],
      ] as const
    )
      .filter(([, port]) => (port as Partial<StockageModules>).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `ModulesModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs PostgreSQL ` +
          "(tables à créer dans apps/api/prisma) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Moteur des modules (AM-126) : activation par agence, gare et ville, tracée au journal d'audit.
 *
 * Importé par `AppModule`. Stockage : adaptateurs PostgreSQL (`postgres.ts`) en production, versions
 * en mémoire pour les tests et le développement (voir `socle/db/stockage.ts`). Les autres modules de l'API importent
 * `ModulesModule` pour protéger leurs routes avec `@ModuleRequis("colis")`.
 */
@Module({
  controllers: [ModulesController],
  providers: [
    ModulesService,
    VerificateurSignature,
    GardeModule,
    VerificationStockageModules,
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: ReglagesModules,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ReglagesModulesPrisma(prisma) : new ReglagesMemoire(),
    },
    {
      provide: AnnuaireAgences,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new AnnuaireAgencesPrisma(prisma) : new AnnuaireMemoire(),
    },
    { provide: DetailsModules, useClass: DetailsAucun },
  ],
  exports: [ModulesService, GardeModule, ReglagesModules, AnnuaireAgences, DetailsModules],
})
export class ModulesModule {}
