import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
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
 * À importer dans `AppModule` (périmètre du socle). Tous les ports ont une version en mémoire par
 * défaut ; le coordinateur les remplace (`{ provide: ColisRepository, useClass: ColisPrisma }`…).
 * Le SMS, lui, passe par `SmsGateway` du socle.
 */
@Module({
  controllers: [ColisController, AgenceColisController, ReclamationsController],
  providers: [
    ColisService,
    GuichetColisService,
    ReclamationsService,
    TachesColis,
    VerificationPortsColis,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: ColisRepository, useClass: ColisMemoire },
    { provide: PhotosColis, useClass: PhotosMemoire },
    { provide: FichiersPhotos, useClass: FichiersPhotosMemoire },
    { provide: ReclamationsRepository, useClass: ReclamationsMemoire },
    { provide: NumerotationColis, useClass: NumerotationMemoire },
    { provide: AnalysePhotoColis, useClass: AnalysePhotoMemoire },
    { provide: PaiementsColis, useClass: PaiementsMemoire },
    { provide: AssureurPartenaire, useClass: AssureurMemoire },
    { provide: NotificationsColis, useClass: NotificationsColisSms },
    { provide: DiffusionSuivi, useClass: DiffusionMemoire },
    { provide: ReferentielColis, useClass: ReferentielMemoire },
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
