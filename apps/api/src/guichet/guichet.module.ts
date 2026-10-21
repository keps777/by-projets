import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { Passagers } from "../billetterie/passagers";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { CaisseModule } from "../caisse/caisse.module";
import { exigerStockageDurable } from "../caisse/stockage";
import { ColisModule } from "../colis/colis.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AccueilService } from "./accueil.service";
import { CadenceService } from "./cadence.service";
import { GuichetController } from "./guichet.controller";
import { ImpressionsService } from "./impressions.service";
import { ImpressionsMemoire } from "./memoire";
import { ImpressionsPrisma } from "./postgres";
import { ImpressionsAgence } from "./ports";
import { PosteGuichetService } from "./poste.service";

/**
 * Garde-fou de production : tant que les impressions seraient gardées en mémoire (perdues au premier
 * redémarrage), le module refuse de démarrer en production.
 */
@Injectable()
export class VerificationStockageGuichet implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly impressions: ImpressionsAgence,
  ) {}

  onModuleInit(): void {
    exigerStockageDurable("GuichetModule", this.config, [["ImpressionsAgence", this.impressions]]);
  }
}

/**
 * Accueil du guichet, mode cadence et impressions (lot Db, recette AM-181, anomalie A2). Le module ne possède que
 * les impressions ; tout le reste est lu dans les modules existants : le catalogue et les billets de la billetterie,
 * les sessions de la caisse, les colis du module colis.
 */
@Module({
  imports: [BilletterieModule, CaisseModule, ColisModule],
  controllers: [GuichetController],
  providers: [
    PosteGuichetService,
    AccueilService,
    CadenceService,
    ImpressionsService,
    Passagers,
    VerificationStockageGuichet,
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: ImpressionsAgence,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ImpressionsPrisma(prisma) : new ImpressionsMemoire(),
    },
  ],
  exports: [ImpressionsAgence],
})
export class GuichetModule {}
