import { Module } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { ClotureMemoire } from "./memoire";
import { CloturesPrisma } from "./postgres";
import { Clotures } from "./ports";
import { VerrouillageMois } from "./verrouillage.service";

/**
 * Le verrou des mois clôturés, seul : les clôtures (PostgreSQL ou mémoire, selon `API_STOCKAGE`) et
 * `VerrouillageMois`. La caisse, la billetterie, la synchronisation et les paiements importent ce module
 * (et non tout `ComptableModule`, avec ses routes et ses tâches) pour refuser les écritures datées d'un
 * mois clos. `ComptableModule` l'importe aussi : il n'y a qu'une instance des clôtures.
 */
@Module({
  providers: [
    {
      provide: Clotures,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new CloturesPrisma(prisma, chiffrement)
          : new ClotureMemoire(),
    },
    VerrouillageMois,
  ],
  exports: [Clotures, VerrouillageMois],
})
export class VerrouillageMoisModule {}
