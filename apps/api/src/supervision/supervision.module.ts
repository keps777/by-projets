import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { CaisseModule } from "../caisse/caisse.module";
import { SyncModule } from "../sync/sync.module";
import { exigerStockageDurable } from "../caisse/stockage";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AppareilsService } from "./appareils.service";
import { EquipeService } from "./equipe.service";
import {
  DemandesAnnulationMemoire,
  EquipeMemoire,
  PinsEquipeMemoire,
  RegistreBilletsMemoire,
  SourceGareMemoire,
} from "./memoire";
import { PinSuperviseurService, PreuvesPinService } from "./pin.service";
import { DemandesAnnulation, EquipeGare, PinsEquipe, RegistreBillets, SourceGare } from "./ports";
import {
  DemandesAnnulationPrisma,
  EquipeGarePrisma,
  PinsEquipePrisma,
  RegistreBilletsPrisma,
  SourceGarePrisma,
} from "./postgres";
import { SupervisionController } from "./supervision.controller";
import { SupervisionService } from "./supervision.service";
import { ValidationSuperviseurService } from "./validation.service";

@Injectable()
export class VerificationStockageSupervision implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly registre: RegistreBillets,
    private readonly demandes: DemandesAnnulation,
    private readonly source: SourceGare,
    private readonly equipe: EquipeGare,
    private readonly pins: PinsEquipe,
  ) {}

  onModuleInit(): void {
    exigerStockageDurable("SupervisionModule", this.config, [
      ["RegistreBillets", this.registre],
      ["DemandesAnnulation", this.demandes],
      ["SourceGare", this.source],
      ["EquipeGare", this.equipe],
      ["PinsEquipe", this.pins],
    ]);
  }
}

/**
 * Supervision de la gare (AM-164) : validation des clôtures, demandes d'annulation et décision par
 * PIN, équipe et PIN (provisoires par SMS, blocage après 3 essais), journal signé.
 *
 * Dans `AppModule`, avec `CaisseModule`. Les ports ont une version PostgreSQL (`postgres.ts`) et une
 * version en mémoire, choisies par `API_STOCKAGE` (voir `socle/db/stockage.ts`).
 */
@Module({
  // BilletterieModule (code de la gare) et SyncModule (appareils, octroi, plages) : lot Dc, planche « SuperviseurDebloquer ».
  imports: [CaisseModule, BilletterieModule, SyncModule],
  controllers: [SupervisionController],
  providers: [
    SupervisionService,
    AppareilsService,
    EquipeService,
    PinSuperviseurService,
    PreuvesPinService,
    ValidationSuperviseurService,
    VerificationStockageSupervision,
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: RegistreBillets,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new RegistreBilletsPrisma(prisma, chiffrement)
          : new RegistreBilletsMemoire(),
    },
    {
      provide: DemandesAnnulation,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new DemandesAnnulationPrisma(prisma)
          : new DemandesAnnulationMemoire(),
    },
    {
      provide: SourceGare,
      inject: [CONFIG, PrismaService, Horloge],
      useFactory: (config: AppConfig, prisma: PrismaService, horloge: Horloge) =>
        stockageSurPostgres(config)
          ? new SourceGarePrisma(prisma, horloge)
          : new SourceGareMemoire(),
    },
    {
      provide: EquipeGare,
      inject: [CONFIG, PrismaService, Horloge],
      useFactory: (config: AppConfig, prisma: PrismaService, horloge: Horloge) =>
        stockageSurPostgres(config) ? new EquipeGarePrisma(prisma, horloge) : new EquipeMemoire(),
    },
    {
      provide: PinsEquipe,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new PinsEquipePrisma(prisma) : new PinsEquipeMemoire(),
    },
  ],
  exports: [
    SupervisionService,
    EquipeService,
    PinSuperviseurService,
    PreuvesPinService,
    RegistreBillets,
    DemandesAnnulation,
    SourceGare,
    EquipeGare,
    PinsEquipe,
  ],
})
export class SupervisionModule {}
