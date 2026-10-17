import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { VerificateurSignature } from "../modules/signature";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { DeuxFoisService } from "./deux-fois.service";
import { EcrituresSignees, PrevenirPatron } from "./ecritures";
import { FinancementController, PartenaireFinancementController } from "./financement.controller";
import { FinancementService } from "./financement.service";
import {
  ConventionsMemoire,
  DonneesAgenceMemoire,
  DossiersMemoire,
  LotsPaieMemoire,
  OffresCreditMemoire,
  PartenaireSimule,
  PrelevementsMemoire,
  ReglagesMemoire,
  SalairesMemoire,
  VersementsPaieMemoire,
} from "./memoire";
import { PaieService } from "./paie.service";
import {
  ConventionsPrisma,
  DossiersPrisma,
  LotsPaiePrisma,
  OffresCreditPrisma,
  PrelevementsPrisma,
  ReglagesPrisma,
} from "./postgres";
import {
  ConventionsFinancement,
  DonneesAgence,
  DossiersFinancement,
  LotsPaie,
  OffresCredit,
  PartenaireFinancier,
  Prelevements,
  ReglagesFinancement,
  SalairesAgence,
  VersementsPaie,
} from "./ports";
import { PrelevementsService } from "./prelevements.service";
import { TachesFinancement } from "./taches.service";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du module est branché sur la mémoire ou sur
 * un simulateur (les dossiers, les prélèvements et la paie seraient perdus ou fictifs).
 */
@Injectable()
export class VerificationPortsFinancement implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly dossiers: DossiersFinancement,
    private readonly prelevements: Prelevements,
    private readonly lots: LotsPaie,
    private readonly salaires: SalairesAgence,
    private readonly versements: VersementsPaie,
    private readonly partenaire: PartenaireFinancier,
    private readonly donnees: DonneesAgence,
    private readonly conventions: ConventionsFinancement,
    private readonly credits: OffresCredit,
    private readonly reglages: ReglagesFinancement,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["DossiersFinancement", this.dossiers],
      ["Prelevements", this.prelevements],
      ["LotsPaie", this.lots],
      ["SalairesAgence", this.salaires],
      ["VersementsPaie", this.versements],
      ["PartenaireFinancier", this.partenaire],
      ["DonneesAgence", this.donnees],
      ["ConventionsFinancement", this.conventions],
      ["OffresCredit", this.credits],
      ["ReglagesFinancement", this.reglages],
    ];
    const volatils = ports
      .filter(([, port]) => (port as { durable?: boolean }).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `FinancementModule : ${volatils.join(", ")} sont en mémoire ou simulés. Brancher les adaptateurs ` +
          "réels (tables PostgreSQL décrites dans apps/api/src/financement/README.md) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Financement, crédit et paie (AM-134) : dossier d'avance sur recettes envoyé au partenaire financier avec
 * ses pièces automatiques (90 jours de ventes certifiées, relevés MoMo rapprochés, pièces de l'agence, mandat
 * de prélèvement signé par le PIN), suivi, retrait tant que ce n'est pas versé, prélèvement d'un pourcentage
 * des ventes MoMo, crédit matériel, paie des équipages par MoMo, paiement du billet en 2 fois (option par agence).
 * AfriMove ne détient jamais les fonds : le partenaire verse, le prélèvement lui revient directement.
 *
 * Module autonome : tous ses accès extérieurs sont des ports (`ports.ts`) avec une version en mémoire
 * (`memoire.ts`). Dans `AppModule`. Les dossiers, prélèvements, lots de paie, réglages, conventions et offres
 * de crédit ont une version PostgreSQL (`postgres.ts`) et une version en mémoire, choisies par `API_STOCKAGE`.
 * Restent simulés, et font donc refuser la production : le partenaire financier (aucun n'est choisi), les
 * versements de paie (agrégateur), les salaires (module équipe) et les données de l'agence.
 */
@Module({
  controllers: [FinancementController, PartenaireFinancementController],
  providers: [
    FinancementService,
    PrelevementsService,
    PaieService,
    DeuxFoisService,
    TachesFinancement,
    EcrituresSignees,
    PrevenirPatron,
    VerificateurSignature,
    VerificationPortsFinancement,
    { provide: Horloge, useClass: HorlogeSysteme },
    {
      provide: DossiersFinancement,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new DossiersPrisma(prisma) : new DossiersMemoire(),
    },
    {
      provide: Prelevements,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new PrelevementsPrisma(prisma) : new PrelevementsMemoire(),
    },
    {
      provide: LotsPaie,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new LotsPaiePrisma(prisma, chiffrement)
          : new LotsPaieMemoire(),
    },
    { provide: SalairesAgence, useClass: SalairesMemoire },
    { provide: VersementsPaie, useClass: VersementsPaieMemoire },
    { provide: PartenaireFinancier, useClass: PartenaireSimule },
    { provide: DonneesAgence, useClass: DonneesAgenceMemoire },
    {
      provide: ConventionsFinancement,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ConventionsPrisma(prisma) : new ConventionsMemoire(),
    },
    {
      provide: OffresCredit,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new OffresCreditPrisma(prisma) : new OffresCreditMemoire(),
    },
    {
      provide: ReglagesFinancement,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ReglagesPrisma(prisma) : new ReglagesMemoire(),
    },
  ],
  exports: [
    FinancementService,
    PrelevementsService,
    PaieService,
    DeuxFoisService,
    TachesFinancement,
    DossiersFinancement,
    Prelevements,
    LotsPaie,
    SalairesAgence,
    VersementsPaie,
    PartenaireFinancier,
    DonneesAgence,
    ConventionsFinancement,
    OffresCredit,
    ReglagesFinancement,
  ],
})
export class FinancementModule {}
