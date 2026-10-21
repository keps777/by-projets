import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { ColisModule } from "../colis/colis.module";
import { ColisRepository, ReferentielColis } from "../colis/ports";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AnnuairePersonnes } from "./annuaire";
import { AgentsRelaisController, InscriptionRelaisController } from "./inscription.controller";
import { InscriptionRelaisService } from "./inscription.service";
import {
  AttributionRolesMemoire,
  BrouillonsRelaisMemoire,
  CompteursDossiersMemoire,
  DemandesRelaisMemoire,
  LieuxInconnus,
  PortefeuilleMemoire,
  ReceptionsRelaisMemoire,
  RelaisMemoire,
  VersementsMemoire,
} from "./memoire";
import {
  AttributionRolesPrisma,
  BrouillonsRelaisPrisma,
  CompteursDossiersPrisma,
  DemandesRelaisPrisma,
  LieuxPrisma,
  PortefeuillePrisma,
  ReceptionsRelaisPrisma,
  RelaisPrisma,
} from "./postgres";
import {
  AttributionRoles,
  BrouillonsRelais,
  ColisDuRelais,
  ColisDuRelaisParColis,
  CompteursDossiers,
  DemandesRelaisRepository,
  Lieux,
  Portefeuille,
  ReceptionsRelais,
  RelaisRepository,
  VersementsMobile,
} from "./ports";
import { RelaisAppController, RelaisVoyageurController } from "./relais.controller";
import { RelaisService } from "./relais.service";
import { TachesRelais } from "./taches.service";
import { VersementsService } from "./versements.service";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du module est branché sur la mémoire
 * ou sur un simulateur (les relais, leurs gains et les versements seraient perdus ou fictifs).
 */
@Injectable()
export class VerificationPortsRelais implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly relais: RelaisRepository,
    private readonly demandes: DemandesRelaisRepository,
    private readonly brouillons: BrouillonsRelais,
    private readonly compteurs: CompteursDossiers,
    private readonly receptions: ReceptionsRelais,
    private readonly lieux: Lieux,
    private readonly portefeuille: Portefeuille,
    private readonly versements: VersementsMobile,
    private readonly roles: AttributionRoles,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["RelaisRepository", this.relais],
      ["DemandesRelaisRepository", this.demandes],
      ["BrouillonsRelais", this.brouillons],
      ["CompteursDossiers", this.compteurs],
      ["ReceptionsRelais", this.receptions],
      ["Lieux", this.lieux],
      ["Portefeuille", this.portefeuille],
      ["VersementsMobile", this.versements],
      ["AttributionRoles", this.roles],
    ];
    const volatils = ports
      .filter(([, port]) => (port as { durable?: boolean }).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `RelaisModule : ${volatils.join(", ")} sont en mémoire ou simulés. Brancher les adaptateurs ` +
          "réels (tables PostgreSQL décrites dans apps/api/src/relais/README.md) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Le module colis vérifie qu'un relais existe et est actif quand l'expéditeur ou le guichet en choisit un
 * (`ReferentielColis.relais`). Au démarrage, cette question est posée aux relais : le module colis ne
 * connaît pas ce module (qui l'importe), c'est donc lui qui se branche sur le référentiel.
 */
@Injectable()
export class BranchementRelaisColis implements OnModuleInit {
  constructor(
    private readonly referentiel: ReferentielColis,
    private readonly relais: RelaisService,
  ) {}

  onModuleInit(): void {
    // Les relais d'abord ; à défaut, ce que le référentiel savait déjà (les relais posés à la main en test).
    const avant = this.referentiel.relais.bind(this.referentiel);
    this.referentiel.relais = async (id: string) => (await this.relais.reference(id)) ?? avant(id);
  }
}

/**
 * Points relais (AM-148) : recherche des relais proches et choix par l'expéditeur, inscription et
 * vérification par un agent AfriMove (code R-…), réception et remise des colis contre code + pièce,
 * garde de 7 jours puis reprise, gains (200 F par colis remis, 100 F par colis repris) versés le lundi.
 *
 * Module autonome : tous ses accès extérieurs sont des ports (`ports.ts`) avec une version en mémoire
 * (`memoire.ts`). Il n'est pas encore dans `AppModule` : le coordinateur branche les adaptateurs
 * PostgreSQL (tables décrites dans le README), les coordonnées des lieux, l'opérateur de versement
 * et l'attribution de rôles, puis l'ajoute aux `imports`. Il s'appuie sur `ColisService.executer`
 * pour tout changement d'état d'un colis.
 */
@Module({
  imports: [ColisModule],
  controllers: [
    RelaisVoyageurController,
    RelaisAppController,
    InscriptionRelaisController,
    AgentsRelaisController,
  ],
  providers: [
    RelaisService,
    InscriptionRelaisService,
    VersementsService,
    TachesRelais,
    AnnuairePersonnes,
    VerificationPortsRelais,
    BranchementRelaisColis,
    { provide: Horloge, useClass: HorlogeSysteme },
    {
      provide: RelaisRepository,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config) ? new RelaisPrisma(prisma, chiffrement) : new RelaisMemoire(),
    },
    {
      provide: DemandesRelaisRepository,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new DemandesRelaisPrisma(prisma, chiffrement)
          : new DemandesRelaisMemoire(),
    },
    {
      provide: BrouillonsRelais,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new BrouillonsRelaisPrisma(prisma, chiffrement)
          : new BrouillonsRelaisMemoire(),
    },
    {
      provide: CompteursDossiers,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new CompteursDossiersPrisma(prisma)
          : new CompteursDossiersMemoire(),
    },
    {
      provide: ReceptionsRelais,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new ReceptionsRelaisPrisma(prisma)
          : new ReceptionsRelaisMemoire(),
    },
    {
      provide: Lieux,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new LieuxPrisma(prisma) : new LieuxInconnus(),
    },
    {
      provide: Portefeuille,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new PortefeuillePrisma(prisma, chiffrement)
          : new PortefeuilleMemoire(),
    },
    // L'envoi d'argent MoMo n'existe pas encore : l'adaptateur simulé reste, et refuse la production.
    { provide: VersementsMobile, useClass: VersementsMemoire },
    {
      provide: AttributionRoles,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new AttributionRolesPrisma(prisma)
          : new AttributionRolesMemoire(),
    },
    {
      provide: ColisDuRelais,
      inject: [ColisRepository],
      useFactory: (colis: ColisRepository) => new ColisDuRelaisParColis(colis),
    },
  ],
  exports: [
    RelaisService,
    InscriptionRelaisService,
    VersementsService,
    TachesRelais,
    AnnuairePersonnes,
    RelaisRepository,
    DemandesRelaisRepository,
    BrouillonsRelais,
    CompteursDossiers,
    ReceptionsRelais,
    Lieux,
    Portefeuille,
    VersementsMobile,
    AttributionRoles,
    ColisDuRelais,
  ],
})
export class RelaisModule {}
