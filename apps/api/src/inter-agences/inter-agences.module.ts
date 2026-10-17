import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { Passagers } from "../billetterie/passagers";
import { ColisModule } from "../colis/colis.module";
import { ReferentielColis } from "../colis/ports";
import { VerificateurSignature } from "../modules/signature";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AnnuairePatrons, SignaturesPatronParPin } from "./annuaire";
import { BilletsService } from "./billets.service";
import { ConventionsService } from "./conventions.service";
import { EchangesService } from "./echanges.service";
import { InterAgencesController, PatronInterAgencesController } from "./inter-agences.controller";
import {
  AnnuaireCompagniesMemoire,
  BilletsCorrespondanceMemoire,
  BilletsEmisMemoire,
  ColisInterAgencesMemoire,
  CompteursReferencesMemoire,
  ContestationsMemoire,
  ConventionsMemoire,
  DepartsMemoire,
  InvitationsMemoire,
  ReglementsMemoire,
  ReglementsMobileMemoire,
} from "./memoire";
import {
  AnnuaireCompagnies,
  BilletsCorrespondance,
  BilletsEmis,
  ColisInterAgences,
  CompteursReferences,
  Contestations,
  ConventionsRepository,
  DepartsInterAgences,
  InvitationsCompagnies,
  Reglements,
  ReglementsMobile,
  SignaturesPatron,
} from "./ports";
import {
  AnnuaireCompagniesPrisma,
  BilletsCorrespondancePrisma,
  BilletsEmisPrisma,
  ColisInterAgencesPrisma,
  CompteursReferencesPrisma,
  ContestationsPrisma,
  ConventionsPrisma,
  DepartsInterAgencesPrisma,
  InvitationsPrisma,
  ReglementsPrisma,
} from "./postgres";
import { ReglementsService } from "./reglements.service";
import { TachesInterAgences } from "./taches.service";
import { VuesService } from "./vues.service";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du module est branché sur la mémoire ou sur un
 * simulateur (les conventions, les scans qui prouvent les créances et les règlements seraient perdus ou fictifs).
 */
@Injectable()
export class VerificationPortsInterAgences implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly conventions: ConventionsRepository,
    private readonly colis: ColisInterAgences,
    private readonly billets: BilletsCorrespondance,
    private readonly reglements: Reglements,
    private readonly contestations: Contestations,
    private readonly invitations: InvitationsCompagnies,
    private readonly compteurs: CompteursReferences,
    private readonly compagnies: AnnuaireCompagnies,
    private readonly departs: DepartsInterAgences,
    private readonly emis: BilletsEmis,
    private readonly mobile: ReglementsMobile,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["ConventionsRepository", this.conventions],
      ["ColisInterAgences", this.colis],
      ["BilletsCorrespondance", this.billets],
      ["Reglements", this.reglements],
      ["Contestations", this.contestations],
      ["InvitationsCompagnies", this.invitations],
      ["CompteursReferences", this.compteurs],
      ["AnnuaireCompagnies", this.compagnies],
      ["DepartsInterAgences", this.departs],
      ["BilletsEmis", this.emis],
      ["ReglementsMobile", this.mobile],
    ];
    const volatils = ports
      .filter(([, port]) => (port as { durable?: boolean }).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `InterAgencesModule : ${volatils.join(", ")} sont en mémoire ou simulés. Brancher les adaptateurs ` +
          "réels (tables PostgreSQL décrites dans apps/api/src/inter-agences/README.md) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Le guichet colis propose « Autre ville via une autre compagnie » (`ReferentielColis.interAgencesDisponible`)
 * quand la compagnie a une convention en vigueur. Le module colis ne connaît pas ce module (qui l'importe) :
 * c'est lui qui se branche sur le référentiel au démarrage.
 */
@Injectable()
export class BranchementInterAgencesColis implements OnModuleInit {
  constructor(
    private readonly referentiel: ReferentielColis,
    private readonly conventions: ConventionsService,
  ) {}

  onModuleInit(): void {
    this.referentiel.interAgencesDisponible = (compagnieId: string) =>
      this.conventions.aUneConventionActive(compagnieId);
  }
}

/**
 * Inter-agences (AM-135) : conventions entre deux compagnies signées par le PIN des deux patrons, colis et
 * billets en plusieurs tronçons sous un seul numéro, transfert de responsabilité au scan, parts par tronçon,
 * règlement hebdomadaire (solde net par MoMo le lundi 08:00, contestation jusqu'au dimanche 20:00),
 * correspondance garantie et replacement.
 *
 * Module autonome : tous ses accès extérieurs sont des ports (`ports.ts`) avec une version en mémoire
 * (`memoire.ts`). Dans `AppModule`. Le stockage (conventions, colis et billets en correspondance, règlements,
 * contestations, invitations, références) et les lectures dans la billetterie (compagnies, départs, billets
 * vendus) ont une version PostgreSQL (`postgres.ts`) et une version en mémoire, choisies par `API_STOCKAGE`.
 * Reste simulé, et fait donc refuser la production : `ReglementsMobile` (virement du solde net par MoMo).
 */
@Module({
  imports: [ColisModule],
  controllers: [InterAgencesController, PatronInterAgencesController],
  providers: [
    ConventionsService,
    EchangesService,
    BilletsService,
    ReglementsService,
    VuesService,
    TachesInterAgences,
    AnnuairePatrons,
    VerificateurSignature,
    VerificationPortsInterAgences,
    BranchementInterAgencesColis,
    Passagers,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: SignaturesPatron, useClass: SignaturesPatronParPin },
    {
      provide: ConventionsRepository,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ConventionsPrisma(prisma) : new ConventionsMemoire(),
    },
    {
      provide: ColisInterAgences,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new ColisInterAgencesPrisma(prisma)
          : new ColisInterAgencesMemoire(),
    },
    {
      provide: BilletsCorrespondance,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new BilletsCorrespondancePrisma(prisma, chiffrement)
          : new BilletsCorrespondanceMemoire(),
    },
    {
      provide: Reglements,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ReglementsPrisma(prisma) : new ReglementsMemoire(),
    },
    {
      provide: Contestations,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ContestationsPrisma(prisma) : new ContestationsMemoire(),
    },
    {
      provide: InvitationsCompagnies,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new InvitationsPrisma(prisma, chiffrement)
          : new InvitationsMemoire(),
    },
    {
      provide: CompteursReferences,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new CompteursReferencesPrisma(prisma)
          : new CompteursReferencesMemoire(),
    },
    {
      provide: AnnuaireCompagnies,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new AnnuaireCompagniesPrisma(prisma, chiffrement)
          : new AnnuaireCompagniesMemoire(),
    },
    {
      provide: DepartsInterAgences,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new DepartsInterAgencesPrisma(prisma) : new DepartsMemoire(),
    },
    {
      provide: BilletsEmis,
      inject: [CONFIG, PrismaService, Passagers],
      useFactory: (config: AppConfig, prisma: PrismaService, passagers: Passagers) =>
        stockageSurPostgres(config)
          ? new BilletsEmisPrisma(prisma, passagers)
          : new BilletsEmisMemoire(),
    },
    { provide: ReglementsMobile, useClass: ReglementsMobileMemoire },
  ],
  exports: [
    ConventionsService,
    EchangesService,
    BilletsService,
    ReglementsService,
    TachesInterAgences,
    ConventionsRepository,
    ColisInterAgences,
    BilletsCorrespondance,
    Reglements,
    Contestations,
    InvitationsCompagnies,
    CompteursReferences,
    AnnuaireCompagnies,
    DepartsInterAgences,
    BilletsEmis,
    ReglementsMobile,
  ],
})
export class InterAgencesModule {}
