import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../../socle/config/config";
import { PrismaService } from "../../socle/db/prisma.service";
import { stockageSurPostgres } from "../../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../../socle/horloge";
import { exigerStockageDurable } from "../stockage";
import { IdempotenceService } from "./idempotence.service";
import { JournalController } from "./journal.controller";
import { JournalSigneService } from "./journal.service";
import { EvenementsTraitesMemoire, JournalAgenceMemoire } from "./memoire";
import { EvenementsTraitesPrisma, JournalAgencePrisma } from "./postgres";
import { EvenementsTraites, JournalAgenceRepository } from "./ports";

@Injectable()
export class VerificationStockageJournal implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly journal: JournalAgenceRepository,
    private readonly traites: EvenementsTraites,
  ) {}

  onModuleInit(): void {
    exigerStockageDurable("JournalAgenceModule", this.config, [
      ["JournalAgenceRepository", this.journal],
      ["EvenementsTraites", this.traites],
    ]);
  }
}

/**
 * Journal signé de l'agence et idempotence des écritures. Importé par `CaisseModule` (qui
 * l'exporte) : la caisse et la supervision écrivent dans le même journal.
 */
@Module({
  controllers: [JournalController],
  providers: [
    JournalSigneService,
    IdempotenceService,
    VerificationStockageJournal,
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: JournalAgenceRepository,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new JournalAgencePrisma(prisma) : new JournalAgenceMemoire(),
    },
    {
      provide: EvenementsTraites,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new EvenementsTraitesPrisma(prisma)
          : new EvenementsTraitesMemoire(),
    },
  ],
  exports: [JournalSigneService, IdempotenceService, JournalAgenceRepository, EvenementsTraites],
})
export class JournalAgenceModule {}
