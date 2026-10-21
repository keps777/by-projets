import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { Passagers } from "../billetterie/passagers";
import { PaiementsModule } from "../paiements/paiements.module";
import { RelaisModule } from "../relais/relais.module";
import { SmsModule } from "../sms/sms.module";
import { HachageService } from "../socle/auth/hachage.service";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { ComptesService } from "../socle/comptes/comptes.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { SmsGateway } from "../socle/sms/sms.gateway";
import {
  MessagesVendeursSms,
  OffreBilletsBilletterie,
  ReglementsAgencePaiements,
} from "./adaptateurs";
import { AgrementsService } from "./agrements.service";
import { CommissionsService } from "./commissions.service";
import {
  AgrementsMemoire,
  CommissionsMemoire,
  ComptesVendeursMemoire,
  NumerosVendeursMemoire,
  VendeursMemoire,
  VentesMemoire,
} from "./memoire";
import { chargerOptionsVendeurs } from "./options";
import {
  AgrementsPrisma,
  CommissionsPrisma,
  ComptesVendeursPrisma,
  NumerosVendeursPrisma,
  VendeursPrisma,
  VentesPrisma,
} from "./postgres";
import {
  AgrementsRepository,
  CommissionsVendeurs,
  ComptesVendeurs,
  MessagesVendeurs,
  NumerosVendeurs,
  OPTIONS_VENDEURS,
  OffreBillets,
  ReglementsAgence,
  VendeursRepository,
  VentesRepository,
  VersementsMobile,
} from "./ports";
import { TachesVendeurs } from "./taches.service";
import { AgenceVendeursController, VendeurController } from "./vendeurs.controller";
import { VendeursService } from "./vendeurs.service";
import { VentesService } from "./ventes.service";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du module est branché sur la mémoire
 * ou sur un simulateur (les vendeurs, leurs ventes et leurs commissions seraient perdus au redémarrage,
 * ou les commissions ne seraient jamais versées).
 */
@Injectable()
export class VerificationPortsVendeurs implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly vendeurs: VendeursRepository,
    private readonly agrements: AgrementsRepository,
    private readonly numeros: NumerosVendeurs,
    private readonly ventes: VentesRepository,
    private readonly commissions: CommissionsVendeurs,
    private readonly comptes: ComptesVendeurs,
    private readonly versements: VersementsMobile,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["VendeursRepository", this.vendeurs],
      ["AgrementsRepository", this.agrements],
      ["NumerosVendeurs", this.numeros],
      ["VentesRepository", this.ventes],
      ["CommissionsVendeurs", this.commissions],
      ["ComptesVendeurs", this.comptes],
      ["VersementsMobile", this.versements],
    ];
    const volatils = ports
      .filter(([, port]) => (port as { durable?: boolean }).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `VendeursModule : ${volatils.join(", ")} sont en mémoire ou simulés. Brancher les adaptateurs réels ` +
          "(tables PostgreSQL décrites dans apps/api/src/vendeurs/README.md) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Vendeurs ambulants (AM-149) : agrément par les agences, vente d'un billet au nom d'un voisin,
 * paiement MoMo de l'agence par le vendeur dans la minute (le vendeur ne détient jamais l'argent du
 * billet), commissions (100 F, 150 F VIP) versées le lundi.
 *
 * Module autonome : tous ses accès extérieurs sont des ports (`ports.ts`). Les départs, sièges et
 * billets passent par la billetterie (AM-162), le paiement de l'agence par les paiements (AM-165),
 * le SMS du billet par la passerelle SMS (AM-166) et le versement des commissions par
 * `VersementsMobile` du module des relais. Dans `AppModule`. Le stockage et les comptes ont une version
 * PostgreSQL (`postgres.ts`) et une version en mémoire, choisies par `API_STOCKAGE`. Reste simulé, et fait
 * donc refuser la production : `VersementsMobile` (commun avec les relais).
 */
@Module({
  imports: [BilletterieModule, PaiementsModule, SmsModule, RelaisModule],
  controllers: [VendeurController, AgenceVendeursController],
  providers: [
    VendeursService,
    VentesService,
    AgrementsService,
    CommissionsService,
    TachesVendeurs,
    VerificationPortsVendeurs,
    Passagers,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: OPTIONS_VENDEURS, useFactory: () => chargerOptionsVendeurs() },
    {
      provide: VendeursRepository,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new VendeursPrisma(prisma, chiffrement)
          : new VendeursMemoire(),
    },
    {
      provide: AgrementsRepository,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new AgrementsPrisma(prisma) : new AgrementsMemoire(),
    },
    {
      provide: NumerosVendeurs,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new NumerosVendeursPrisma(prisma)
          : new NumerosVendeursMemoire(),
    },
    {
      provide: VentesRepository,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config) ? new VentesPrisma(prisma, chiffrement) : new VentesMemoire(),
    },
    {
      provide: CommissionsVendeurs,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new CommissionsPrisma(prisma, chiffrement)
          : new CommissionsMemoire(),
    },
    {
      provide: ComptesVendeurs,
      inject: [CONFIG, PrismaService, ComptesService, HachageService, SmsGateway],
      useFactory: (
        config: AppConfig,
        prisma: PrismaService,
        comptes: ComptesService,
        hachage: HachageService,
        sms: SmsGateway,
      ) =>
        stockageSurPostgres(config)
          ? new ComptesVendeursPrisma(prisma, comptes, hachage, sms)
          : new ComptesVendeursMemoire(),
    },
    { provide: OffreBillets, useClass: OffreBilletsBilletterie },
    { provide: ReglementsAgence, useClass: ReglementsAgencePaiements },
    { provide: MessagesVendeurs, useClass: MessagesVendeursSms },
  ],
  exports: [
    VendeursService,
    VentesService,
    AgrementsService,
    CommissionsService,
    TachesVendeurs,
    VendeursRepository,
    AgrementsRepository,
    NumerosVendeurs,
    VentesRepository,
    CommissionsVendeurs,
    ComptesVendeurs,
    OffreBillets,
    ReglementsAgence,
    MessagesVendeurs,
  ],
})
export class VendeursModule {}
