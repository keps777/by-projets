import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { Passagers } from "../billetterie/passagers";
import { GpsModule } from "../gps/gps.module";
import { SmsModule } from "../sms/sms.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { BordController } from "./bord.controller";
import { ChauffeurService } from "./chauffeur.service";
import { DepartsBord, EvenementsBord, VentesBord } from "./commun.service";
import { ControleService } from "./controle.service";
import { ConvoyeurService } from "./convoyeur.service";
import {
  ControlesBordMemoire,
  DepensesBordMemoire,
  IncidentsBordMemoire,
  PassagesRouteMemoire,
  RetardsDepartMemoire,
  VentesEnRouteMemoire,
} from "./memoire";
import { MessagesBordSms } from "./messages.sms";
import {
  ControlesBord,
  DepensesBord,
  IncidentsBord,
  MessagesBord,
  PassagesRoute,
  RetardsDepart,
  VentesEnRoute,
} from "./ports";
import {
  ControlesBordPrisma,
  DepensesBordPrisma,
  IncidentsBordPrisma,
  PassagesRoutePrisma,
  RetardsDepartPrisma,
  VentesEnRoutePrisma,
} from "./postgres";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du bord est branché sur la mémoire (ventes
 * en route, passages, dépenses, incidents, retards et contrôles seraient perdus au redémarrage).
 */
@Injectable()
export class VerificationPortsBord implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly ventes: VentesEnRoute,
    private readonly passages: PassagesRoute,
    private readonly depenses: DepensesBord,
    private readonly incidents: IncidentsBord,
    private readonly retards: RetardsDepart,
    private readonly controles: ControlesBord,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["VentesEnRoute", this.ventes],
      ["PassagesRoute", this.passages],
      ["DepensesBord", this.depenses],
      ["IncidentsBord", this.incidents],
      ["RetardsDepart", this.retards],
      ["ControlesBord", this.controles],
    ];
    const volatils = ports
      .filter(([, port]) => (port as { durable?: boolean }).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `BordModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs PostgreSQL ` +
          "(tables décrites dans apps/api/src/bord/README.md) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Le bord (AM-181, écart A3 de la recette) : la feuille du convoyeur et ses ventes en route, la feuille du
 * chauffeur et ses dépenses, incidents, retards et arrivées, le contrôle inopiné à bord.
 *
 * Dans `AppModule` (bloc « LOT Dc »). Il emprunte les départs, billets, sièges et colis à la billetterie, la
 * position du bus au suivi GPS, le SMS à la passerelle SMS : il ne les recopie pas. Ses ports de stockage ont
 * une version PostgreSQL (`postgres.ts`) et une version en mémoire, choisies par `API_STOCKAGE` ; les SMS
 * passent par `MessagesBordSms`. Rien d'autre ne reste en mémoire dans ce module.
 */
@Module({
  imports: [BilletterieModule, GpsModule, SmsModule],
  controllers: [BordController],
  providers: [
    Passagers,
    EvenementsBord,
    DepartsBord,
    VentesBord,
    ConvoyeurService,
    ChauffeurService,
    ControleService,
    VerificationPortsBord,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: MessagesBord, useClass: MessagesBordSms },
    {
      provide: VentesEnRoute,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new VentesEnRoutePrisma(prisma) : new VentesEnRouteMemoire(),
    },
    {
      provide: PassagesRoute,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new PassagesRoutePrisma(prisma) : new PassagesRouteMemoire(),
    },
    {
      provide: DepensesBord,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new DepensesBordPrisma(prisma) : new DepensesBordMemoire(),
    },
    {
      provide: IncidentsBord,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new IncidentsBordPrisma(prisma) : new IncidentsBordMemoire(),
    },
    {
      provide: RetardsDepart,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new RetardsDepartPrisma(prisma) : new RetardsDepartMemoire(),
    },
    {
      provide: ControlesBord,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ControlesBordPrisma(prisma) : new ControlesBordMemoire(),
    },
  ],
  exports: [
    ConvoyeurService,
    ChauffeurService,
    ControleService,
    VentesEnRoute,
    PassagesRoute,
    DepensesBord,
    IncidentsBord,
    RetardsDepart,
    ControlesBord,
  ],
})
export class BordModule {}
