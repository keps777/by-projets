import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AttributionPlages, ControleNumeros } from "../sync/ports";
import { AttributionPlagesServeur, ControleNumerosServeur } from "./adaptateurs";
import { ControleJourneeService } from "./controle-journee.service";
import {
  AlertesNumerotationMemoire,
  PlagesAttribueesMemoire,
  RegistreNumerosMemoire,
} from "./memoire";
import { NumerotationController } from "./numerotation.controller";
import { NumerotationService } from "./numerotation.service";
import {
  AlertesNumerotationPrisma,
  PlagesAttribueesPrisma,
  RegistreNumerosPrisma,
} from "./postgres";
import { PlagesService } from "./plages.service";
import {
  AlertesNumerotation,
  PlagesAttribuees,
  RegistreNumeros,
  type StockageNumerotation,
} from "./ports";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port de la numérotation est encore en
 * mémoire (les numéros reçus, les plages et les alertes seraient perdus au premier redémarrage, et
 * l'unicité des numéros ne tiendrait plus).
 */
@Injectable()
export class VerificationStockageNumerotation implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly plages: PlagesAttribuees,
    private readonly registre: RegistreNumeros,
    private readonly alertes: AlertesNumerotation,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["PlagesAttribuees", this.plages],
      ["RegistreNumeros", this.registre],
      ["AlertesNumerotation", this.alertes],
    ];
    const volatils = ports
      .filter(([, port]) => (port as Partial<StockageNumerotation>).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `NumerotationModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs ` +
          "PostgreSQL (tables à créer dans apps/api/prisma, voir le README) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Numérotation sans trou côté serveur et plages (AM-161).
 *
 * Fournit, sous les jetons de la synchronisation, de vraies implémentations de `ControleNumeros` et
 * `AttributionPlages` (`sync/ports.ts`) : `SyncModule` les utilise en important ce module à la
 * place de ses versions en mémoire (voir le README, « Brancher sur la synchronisation »).
 *
 * Importé par `SyncModule` (donc par `AppModule`) : ses routes `/numerotation/**` sont montées une
 * fois. Stockage : adaptateurs PostgreSQL (`postgres.ts`) en production, versions en mémoire pour les
 * tests et le développement (voir `socle/db/stockage.ts`).
 */
@Module({
  controllers: [NumerotationController],
  providers: [
    VerificationStockageNumerotation,
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: PlagesAttribuees,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new PlagesAttribueesPrisma(prisma)
          : new PlagesAttribueesMemoire(),
    },
    {
      provide: RegistreNumeros,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new RegistreNumerosPrisma(prisma)
          : new RegistreNumerosMemoire(),
    },
    {
      provide: AlertesNumerotation,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new AlertesNumerotationPrisma(prisma)
          : new AlertesNumerotationMemoire(),
    },
    PlagesService,
    NumerotationService,
    ControleJourneeService,
    ControleNumerosServeur,
    AttributionPlagesServeur,
    { provide: ControleNumeros, useExisting: ControleNumerosServeur },
    { provide: AttributionPlages, useExisting: AttributionPlagesServeur },
  ],
  exports: [
    ControleNumeros,
    AttributionPlages,
    PlagesService,
    NumerotationService,
    ControleJourneeService,
    PlagesAttribuees,
    RegistreNumeros,
    AlertesNumerotation,
  ],
})
export class NumerotationModule {}
