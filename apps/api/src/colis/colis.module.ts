import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { NumerotationModule } from "../numerotation/numerotation.module";
import { NumerotationService } from "../numerotation/numerotation.service";
import { RegistreNumeros } from "../numerotation/ports";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AgenceColisController } from "./agence.controller";
import { ColisController } from "./colis.controller";
import { ColisService } from "./colis.service";
import { GuichetColisService } from "./guichet.service";
import {
  AnalysePhotoMemoire,
  AssureurMemoire,
  ColisMemoire,
  DiffusionMemoire,
  FichiersPhotosMemoire,
  NumerotationMemoire,
  PaiementsMemoire,
  PhotosMemoire,
  ReclamationsMemoire,
  ReferentielMemoire,
} from "./memoire";
import { NotificationsColisSms } from "./notifications.sms";
import { ReferentielColisPrisma } from "./postgres-referentiel";
import {
  ColisPrisma,
  NumerotationColisServeur,
  PhotosColisPrisma,
  ReclamationsColisPrisma,
} from "./postgres";
import {
  AnalysePhotoColis,
  AssureurPartenaire,
  ColisRepository,
  DiffusionSuivi,
  FichiersPhotos,
  NotificationsColis,
  NumerotationColis,
  PaiementsColis,
  PhotosColis,
  ReclamationsRepository,
  ReferentielColis,
} from "./ports";
import { ReclamationsController } from "./reclamations.controller";
import { ReclamationsService } from "./reclamations.service";
import { TachesColis } from "./taches.service";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du module est branché sur la
 * mémoire ou sur un simulateur (les colis, les photos et les paiements seraient perdus ou fictifs).
 */
@Injectable()
export class VerificationPortsColis implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly colis: ColisRepository,
    private readonly photos: PhotosColis,
    private readonly fichiers: FichiersPhotos,
    private readonly reclamations: ReclamationsRepository,
    private readonly numerotation: NumerotationColis,
    private readonly analyse: AnalysePhotoColis,
    private readonly paiements: PaiementsColis,
    private readonly assureur: AssureurPartenaire,
    private readonly notifications: NotificationsColis,
    private readonly diffusion: DiffusionSuivi,
    private readonly referentiel: ReferentielColis,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["ColisRepository", this.colis],
      ["PhotosColis", this.photos],
      ["FichiersPhotos", this.fichiers],
      ["ReclamationsRepository", this.reclamations],
      ["NumerotationColis", this.numerotation],
      ["AnalysePhotoColis", this.analyse],
      ["PaiementsColis", this.paiements],
      ["AssureurPartenaire", this.assureur],
      ["NotificationsColis", this.notifications],
      ["DiffusionSuivi", this.diffusion],
      ["ReferentielColis", this.referentiel],
    ];
    const volatils = ports
      .filter(([, port]) => (port as { durable?: boolean }).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `ColisModule : ${volatils.join(", ")} sont en mémoire ou simulés. Brancher les adaptateurs ` +
          "réels (tables PostgreSQL décrites dans apps/api/src/colis/README.md) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Colis (AM-163) : enregistrement au guichet et dans l'app, photos supprimées à 90 jours, code de
 * retrait haché, états et scans, assurance, complément de poids, réclamations et indemnisation.
 *
 * Dans `AppModule`. Les ports de persistance (colis, photos, réclamations, numéros) ont une version
 * PostgreSQL (`postgres.ts`) et une version en mémoire, choisies par `API_STOCKAGE` (voir
 * `socle/db/stockage.ts`). Restent en mémoire ou simulés, et font donc refuser la production :
 * le stockage des fichiers de photos, l'analyse de photo, les paiements, l'assureur et la diffusion
 * du suivi en direct. L'annuaire des départs, des gares, des guichets et des relais (`ReferentielColis`)
 * lit les tables d'administration sur PostgreSQL (`postgres-referentiel.ts`).
 * Le SMS, lui, passe par `SmsGateway` du socle.
 */
@Module({
  imports: [NumerotationModule],
  controllers: [ColisController, AgenceColisController, ReclamationsController],
  providers: [
    ColisService,
    GuichetColisService,
    ReclamationsService,
    TachesColis,
    VerificationPortsColis,
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: ColisRepository,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config) ? new ColisPrisma(prisma, chiffrement) : new ColisMemoire(),
    },
    {
      provide: PhotosColis,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new PhotosColisPrisma(prisma) : new PhotosMemoire(),
    },
    { provide: FichiersPhotos, useClass: FichiersPhotosMemoire },
    {
      provide: ReclamationsRepository,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new ReclamationsColisPrisma(prisma)
          : new ReclamationsMemoire(),
    },
    {
      provide: NumerotationColis,
      inject: [CONFIG, NumerotationService, RegistreNumeros],
      useFactory: (
        config: AppConfig,
        numerotation: NumerotationService,
        registre: RegistreNumeros,
      ) =>
        stockageSurPostgres(config)
          ? new NumerotationColisServeur(numerotation, registre)
          : new NumerotationMemoire(),
    },
    { provide: AnalysePhotoColis, useClass: AnalysePhotoMemoire },
    { provide: PaiementsColis, useClass: PaiementsMemoire },
    { provide: AssureurPartenaire, useClass: AssureurMemoire },
    { provide: NotificationsColis, useClass: NotificationsColisSms },
    { provide: DiffusionSuivi, useClass: DiffusionMemoire },
    {
      provide: ReferentielColis,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new ReferentielColisPrisma(prisma) : new ReferentielMemoire(),
    },
  ],
  exports: [
    ColisService,
    GuichetColisService,
    ReclamationsService,
    TachesColis,
    ColisRepository,
    PhotosColis,
    FichiersPhotos,
    ReclamationsRepository,
    NumerotationColis,
    AnalysePhotoColis,
    PaiementsColis,
    AssureurPartenaire,
    NotificationsColis,
    DiffusionSuivi,
    ReferentielColis,
  ],
})
export class ColisModule {}
