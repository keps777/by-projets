import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import {
  AlertesMemoire,
  AppareilsMemoire,
  AttributionPlagesParRang,
  ControleNumerosMemoire,
  JournalMemoire,
  ProvisionnementMemoire,
  SiegesMemoire,
  type StockageSync,
} from "./memoire";
import {
  AlertesSync,
  AppareilsSync,
  AttributionPlages,
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
 * À importer dans `AppModule` (périmètre du socle). Les ports ci-dessous sont remplaçables : AM-161
 * fournit `ControleNumeros` et `AttributionPlages` ; les adaptateurs PostgreSQL remplacent les
 * versions en mémoire.
 */
@Module({
  controllers: [SyncController],
  providers: [
    RejeuService,
    VerificationStockageSync,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: AppareilsSync, useClass: AppareilsMemoire },
    { provide: JournalSync, useClass: JournalMemoire },
    { provide: SiegesSync, useClass: SiegesMemoire },
    { provide: AlertesSync, useClass: AlertesMemoire },
    { provide: ProvisionnementSync, useClass: ProvisionnementMemoire },
    { provide: ControleNumeros, useClass: ControleNumerosMemoire },
    { provide: AttributionPlages, useClass: AttributionPlagesParRang },
  ],
  exports: [
    RejeuService,
    AppareilsSync,
    JournalSync,
    SiegesSync,
    AlertesSync,
    ProvisionnementSync,
    ControleNumeros,
    AttributionPlages,
  ],
})
export class SyncModule {}
