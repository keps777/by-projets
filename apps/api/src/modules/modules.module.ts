import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { GardeModule } from "./garde-module";
import { AnnuaireMemoire, DetailsAucun, ReglagesMemoire, type StockageModules } from "./memoire";
import { ModulesController } from "./modules.controller";
import { ModulesService } from "./modules.service";
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
 * À importer dans `AppModule` (périmètre du socle). Les ports sont remplaçables : les adaptateurs
 * PostgreSQL remplacent les versions en mémoire. Les autres modules de l'API importent
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
    { provide: ReglagesModules, useClass: ReglagesMemoire },
    { provide: AnnuaireAgences, useClass: AnnuaireMemoire },
    { provide: DetailsModules, useClass: DetailsAucun },
  ],
  exports: [ModulesService, GardeModule, ReglagesModules, AnnuaireAgences, DetailsModules],
})
export class ModulesModule {}
