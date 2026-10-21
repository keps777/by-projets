import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { VerificateurSignature } from "../modules/signature";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { SyncModule } from "../sync/sync.module";
import { AdministrationController } from "./administration.controller";
import { AppareilsController } from "./appareils.controller";
import { AppareilsService } from "./appareils.service";
import { BusService } from "./bus.service";
import { CONFIG_ADMINISTRATION, chargerConfigAdministration } from "./config";
import { DepartsService } from "./departs.service";
import { KiosqueService } from "./kiosque.service";
import { LignesPatronController } from "./lignes-patron.controller";
import { LignesService } from "./lignes.service";
import {
  AnnuaireAdminMemoire,
  LignesMemoire,
  OrdresAppareilsMemoire,
  ParcBusMemoire,
  ProgrammeMemoire,
  RegistreAppareilsMemoire,
} from "./memoire";
import {
  AnnuaireAdminPrisma,
  LignesPrisma,
  OrdresAppareilsPrisma,
  ParcBusPrisma,
  ProgrammePrisma,
  RegistreAppareilsPrisma,
} from "./postgres";
import { PlanificateurLignes } from "./planificateur";
import {
  AnnuaireAdmin,
  Lignes,
  OrdresAppareils,
  ParcBus,
  Programme,
  RegistreAppareils,
  type StockageAdministration,
} from "./ports";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port de l'administration est encore branché sur la
 * mémoire (lignes, départs, bus, appareils enrôlés et ordres d'effacement seraient perdus au premier redémarrage).
 */
@Injectable()
export class VerificationStockageAdministration implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly annuaire: AnnuaireAdmin,
    private readonly lignes: Lignes,
    private readonly parc: ParcBus,
    private readonly programme: Programme,
    private readonly registre: RegistreAppareils,
    private readonly ordres: OrdresAppareils,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const volatils = (
      [
        ["AnnuaireAdmin", this.annuaire],
        ["Lignes", this.lignes],
        ["ParcBus", this.parc],
        ["Programme", this.programme],
        ["RegistreAppareils", this.registre],
        ["OrdresAppareils", this.ordres],
      ] as const
    )
      .filter(([, port]) => (port as Partial<StockageAdministration>).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `AdministrationModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs PostgreSQL ` +
          "(API_STOCKAGE=postgres) avant de démarrer en production.",
      );
    }
  }
}

/** Un port : PostgreSQL en production (ou avec `API_STOCKAGE=postgres`), mémoire ailleurs. */
function port<T>(
  fournisseur: abstract new (...args: never[]) => T,
  prisma: new (prisma: PrismaService) => T,
  memoire: new () => T,
) {
  return {
    provide: fournisseur,
    inject: [CONFIG, PrismaService],
    useFactory: (config: AppConfig, base: PrismaService): T =>
      stockageSurPostgres(config) ? new prisma(base) : new memoire(),
  };
}

/**
 * Administration de l'agence (AM-093, AM-120) : création et réglages des lignes (`/patron/reglages/lignes`),
 * génération récurrente des départs, bus, équipages, déclaration et enrôlement des appareils, effacement à distance
 * du kiosque (`/admin/*` et `/appareils/*`). Voir `README.md`.
 *
 * **Propriétaire des lignes** : leurs horaires (`horaire_ligne`), leurs réglages (`reglage_ligne`) et les départs qu'on
 * en génère. Le module patron lit les lignes par `LignesService.resumes` (accueil des réglages), jamais par SQL.
 *
 * Importé par `AppModule`. Les ports suivent `API_STOCKAGE` (voir `socle/db/stockage.ts`).
 */
@Module({
  imports: [SyncModule],
  controllers: [AdministrationController, LignesPatronController, AppareilsController],
  providers: [
    LignesService,
    BusService,
    DepartsService,
    AppareilsService,
    KiosqueService,
    VerificateurSignature,
    VerificationStockageAdministration,
    PlanificateurLignes,
    {
      provide: CONFIG_ADMINISTRATION,
      inject: [CONFIG],
      useFactory: (config: AppConfig) =>
        chargerConfigAdministration({ ...process.env, NODE_ENV: config.env }),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    port(AnnuaireAdmin, AnnuaireAdminPrisma, AnnuaireAdminMemoire),
    port(Lignes, LignesPrisma, LignesMemoire),
    port(ParcBus, ParcBusPrisma, ParcBusMemoire),
    {
      provide: Programme,
      inject: [CONFIG, PrismaService, Lignes],
      useFactory: (config: AppConfig, base: PrismaService, lignes: Lignes) =>
        stockageSurPostgres(config) ? new ProgrammePrisma(base) : new ProgrammeMemoire(lignes),
    },
    port(RegistreAppareils, RegistreAppareilsPrisma, RegistreAppareilsMemoire),
    port(OrdresAppareils, OrdresAppareilsPrisma, OrdresAppareilsMemoire),
  ],
  exports: [
    CONFIG_ADMINISTRATION,
    PlanificateurLignes,
    LignesService,
    DepartsService,
    BusService,
    AppareilsService,
    KiosqueService,
    AnnuaireAdmin,
    Lignes,
    ParcBus,
    Programme,
    RegistreAppareils,
    OrdresAppareils,
  ],
})
export class AdministrationModule {}
