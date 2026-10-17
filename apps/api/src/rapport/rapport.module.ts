import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnModuleInit,
  type Provider,
} from "@nestjs/common";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { CaisseModule } from "../caisse/caisse.module";
import { NumerotationModule } from "../numerotation/numerotation.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { CollecteRapportService } from "./collecte.service";
import { CONFIG_RAPPORT, chargerConfigRapport, type ConfigRapport } from "./config";
import {
  ActiviteColisMemoire,
  AnnulationsMemoire,
  CaissesMemoire,
  ControlesMemoire,
  DepartsMemoire,
  RapportsSoirMemoire,
  ReferentielMemoire,
  TrousMemoire,
  VentesBilletsMemoire,
} from "./memoire";
import { PlanificateurRapport } from "./planificateur";
import {
  ActiviteColisPrisma,
  AnnulationsDuJourPrisma,
  ControlesEnRoutePrisma,
  RapportsSoirPrisma,
  ReferentielRapportPrisma,
  VentesBilletsPrisma,
} from "./postgres";
import {
  ActiviteColis,
  AnnulationsDuJour,
  AssistantRapport,
  AssistantRapportAucun,
  CaissesDuJour,
  ControlesEnRoute,
  DepartsDuJour,
  RapportsSoir,
  ReferentielRapport,
  TrousNumerotation,
  VentesBillets,
  type Durable,
} from "./ports";
import {
  CaissesDuJourSessions,
  DepartsDuJourBilletterie,
  TrousNumerotationControle,
} from "./ponts";
import { RapportController } from "./rapport.controller";
import { RapportSoirService } from "./rapport.service";
import { SourceRapportSoirPourWhatsApp } from "./source-whatsapp";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du rapport est en mémoire (les
 * rapports arrêtés et les faits du jour seraient perdus ou vides).
 */
@Injectable()
export class VerificationRapport implements OnModuleInit {
  constructor(
    @Inject(CONFIG_RAPPORT) private readonly config: ConfigRapport,
    private readonly referentiel: ReferentielRapport,
    private readonly ventes: VentesBillets,
    private readonly departs: DepartsDuJour,
    private readonly colis: ActiviteColis,
    private readonly caisses: CaissesDuJour,
    private readonly annulations: AnnulationsDuJour,
    private readonly trous: TrousNumerotation,
    private readonly controles: ControlesEnRoute,
    private readonly rapports: RapportsSoir,
  ) {}

  onModuleInit(): void {
    if (!this.config.production) return;
    const ports: Array<[string, Durable]> = [
      ["ReferentielRapport", this.referentiel],
      ["VentesBillets", this.ventes],
      ["DepartsDuJour", this.departs],
      ["ActiviteColis", this.colis],
      ["CaissesDuJour", this.caisses],
      ["AnnulationsDuJour", this.annulations],
      ["TrousNumerotation", this.trous],
      ["ControlesEnRoute", this.controles],
      ["RapportsSoir", this.rapports],
    ];
    const volatils = ports.filter(([, port]) => !port.durable).map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `RapportModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs ` +
          "PostgreSQL (voir le README de apps/api/src/rapport) avant de démarrer en production.",
      );
    }
  }
}

/** Adaptateurs de production à brancher à la place de ceux en mémoire (voir `RapportModule.avec`). */
export interface AdaptateursRapport {
  /** Modules qui fournissent ce dont les adaptateurs ont besoin (Prisma, caisse, billetterie…). */
  imports?: ModuleMetadata["imports"];
  /**
   * Fournisseurs qui remplacent ceux par défaut : `ReferentielRapport`, `VentesBillets`,
   * `DepartsDuJour`, `ActiviteColis`, `CaissesDuJour`, `AnnulationsDuJour`, `TrousNumerotation`,
   * `ControlesEnRoute`, `AssistantRapport`, `RapportsSoir`.
   */
  providers?: Provider[];
}

/**
 * Rapport du soir (AM-171) : à 21 h, les agrégats du jour par gare (billets, colis, recette,
 * écarts de caisse validés, départs fusionnés, soute, ventes en route, contrôles, remplissage,
 * annulations, ventes en ligne, trous de numérotation, billets de cadence sans nom), signés par les
 * superviseurs qui ont validé les caisses. Arrêté une fois par compagnie et par jour, lu par
 * l'application du patron (`GET /patron/rapports/soir`) et par la passerelle WhatsApp
 * (`SourceRapportSoirPourWhatsApp`).
 *
 * Module autonome : il ne dépend que du socle (configuration, audit, horloge). Tout le reste passe
 * par des ports (`ports.ts`) ; la version en mémoire de chacun sert aux tests, le coordinateur
 * branche les vrais avec `RapportModule.avec({ … })` ou `RapportModule.avecModulesExistants()`.
 */
@Module({
  controllers: [RapportController],
  providers: [
    {
      provide: CONFIG_RAPPORT,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigRapport =>
        chargerConfigRapport({ ...process.env, NODE_ENV: config.env }, config.env === "production"),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    {
      provide: ReferentielRapport,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): ReferentielRapport =>
        stockageSurPostgres(config)
          ? new ReferentielRapportPrisma(prisma)
          : new ReferentielMemoire(),
    },
    {
      provide: VentesBillets,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): VentesBillets =>
        stockageSurPostgres(config) ? new VentesBilletsPrisma(prisma) : new VentesBilletsMemoire(),
    },
    { provide: DepartsDuJour, useClass: DepartsMemoire },
    {
      provide: ActiviteColis,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): ActiviteColis =>
        stockageSurPostgres(config) ? new ActiviteColisPrisma(prisma) : new ActiviteColisMemoire(),
    },
    { provide: CaissesDuJour, useClass: CaissesMemoire },
    {
      provide: AnnulationsDuJour,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): AnnulationsDuJour =>
        stockageSurPostgres(config)
          ? new AnnulationsDuJourPrisma(prisma)
          : new AnnulationsMemoire(),
    },
    { provide: TrousNumerotation, useClass: TrousMemoire },
    {
      provide: ControlesEnRoute,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): ControlesEnRoute =>
        stockageSurPostgres(config) ? new ControlesEnRoutePrisma(prisma) : new ControlesMemoire(),
    },
    { provide: AssistantRapport, useClass: AssistantRapportAucun },
    {
      provide: RapportsSoir,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): RapportsSoir =>
        stockageSurPostgres(config) ? new RapportsSoirPrisma(prisma) : new RapportsSoirMemoire(),
    },
    CollecteRapportService,
    RapportSoirService,
    PlanificateurRapport,
    SourceRapportSoirPourWhatsApp,
    VerificationRapport,
  ],
  exports: [
    RapportSoirService,
    SourceRapportSoirPourWhatsApp,
    PlanificateurRapport,
    ReferentielRapport,
    RapportsSoir,
  ],
})
export class RapportModule {
  /** Le module avec des adaptateurs de production : les fournisseurs donnés remplacent ceux par défaut. */
  static avec(adaptateurs: AdaptateursRapport): DynamicModule {
    return {
      module: RapportModule,
      imports: adaptateurs.imports ?? [],
      providers: adaptateurs.providers ?? [],
    };
  }

  /**
   * Le module branché sur la caisse, la billetterie et la numérotation (`ponts.ts`) : sessions de
   * caisse, départs et trous de numérotation viennent de ces modules. `extra` ajoute ou remplace
   * les autres adaptateurs (référentiel, ventes, colis, annulations, contrôles, rapports).
   */
  static avecModulesExistants(extra: AdaptateursRapport = {}): DynamicModule {
    return {
      module: RapportModule,
      imports: [CaisseModule, BilletterieModule, NumerotationModule, ...(extra.imports ?? [])],
      providers: [
        { provide: CaissesDuJour, useClass: CaissesDuJourSessions },
        { provide: DepartsDuJour, useClass: DepartsDuJourBilletterie },
        { provide: TrousNumerotation, useClass: TrousNumerotationControle },
        ...(extra.providers ?? []),
      ],
    };
  }
}
