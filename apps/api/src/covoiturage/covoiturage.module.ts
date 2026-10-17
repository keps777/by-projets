import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { PaiementsModule } from "../paiements/paiements.module";
import { Verrous } from "../paiements/verrous";
import { SmsModule } from "../sms/sms.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import {
  AbonnementPaiementsCovoiturage,
  AnnuaireComptesCovoiturage,
  CommandesCovoiturage,
  NotifieurSmsCovoiturage,
  RemboursementsViaPaiements,
} from "./adaptateurs";
import { BalayageCovoiturage } from "./balayage";
import { CONFIG_COVOITURAGE, chargerConfigCovoiturage, type ConfigCovoiturage } from "./config";
import { CovoiturageConducteurController } from "./conducteur.controller";
import { ConducteurService } from "./conducteur.service";
import { DemandesService } from "./demandes.service";
import { CovoiturageExploitationController } from "./exploitation.controller";
import { ExploitationCovoiturageService } from "./exploitation.service";
import { LiberationService } from "./liberation.service";
import {
  DemandesMemoire,
  DossiersMemoire,
  NotesMemoire,
  PasserelleVersementsSimulee,
  ReferentielMemoire,
  ReservationsMemoire,
  TrajetsMemoire,
  TrajetsReguliersMemoire,
  VersementsMemoire,
} from "./memoire";
import {
  AnnuaireCovoiturage,
  Demandes,
  Dossiers,
  NotifieurCovoiturage,
  Notes,
  PasserelleVersements,
  ReferentielCovoiturage,
  RemboursementsCovoiturage,
  Reservations,
  Trajets,
  TrajetsReguliersPassagers,
  Versements,
  type StockageCovoiturage,
} from "./ports";
import { ProfilsService } from "./profils.service";
import { RechercheService } from "./recherche.service";
import { ReservationsService } from "./reservations.service";
import { ReputationService } from "./reputation.service";
import { TrajetRegulierService } from "./trajet-regulier.service";
import { TrajetsService } from "./trajets.service";
import { VerificationService } from "./verification.service";
import { CovoiturageVoyageurController } from "./voyageur.controller";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du module est en mémoire ou simulé
 * (trajets, réservations, dossiers des conducteurs et versements seraient perdus au redémarrage, et
 * le conducteur ne serait jamais payé pour de bon).
 */
@Injectable()
export class VerificationStockageCovoiturage implements OnModuleInit {
  constructor(
    @Inject(CONFIG_COVOITURAGE) private readonly config: ConfigCovoiturage,
    private readonly trajets: Trajets,
    private readonly reservations: Reservations,
    private readonly dossiers: Dossiers,
    private readonly versements: Versements,
    private readonly passerelle: PasserelleVersements,
    private readonly demandes: Demandes,
    private readonly notes: Notes,
    private readonly reguliers: TrajetsReguliersPassagers,
    private readonly referentiel: ReferentielCovoiturage,
  ) {}

  onModuleInit(): void {
    if (!this.config.production) return;
    const ports: [string, unknown][] = [
      ["Trajets", this.trajets],
      ["Reservations", this.reservations],
      ["Dossiers", this.dossiers],
      ["Versements", this.versements],
      ["PasserelleVersements", this.passerelle],
      ["Demandes", this.demandes],
      ["Notes", this.notes],
      ["TrajetsReguliersPassagers", this.reguliers],
      ["ReferentielCovoiturage", this.referentiel],
    ];
    const volatils = ports
      .filter(([, port]) => (port as Partial<StockageCovoiturage>).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `CovoiturageModule : ${volatils.join(", ")} sont en mémoire ou simulés. Brancher les ` +
          "adaptateurs PostgreSQL (tables décrites dans apps/api/src/covoiturage/README.md), le " +
          "décaissement MoMo de l'agrégateur et le référentiel des lignes avant de démarrer en production.",
      );
    }
  }
}

/**
 * Covoiturage (AM-054) : trajets entre villes et en ville, trajets réguliers, réservations, demandes de
 * passagers, vérification des conducteurs (pièce d'identité, permis, carte grise, voiture), notes,
 * paiement libéré au conducteur à l'arrivée (confirmation du passager ou 2 h après l'heure prévue),
 * 250 F de frais par place, annulation et remboursement.
 *
 * À importer dans `AppModule` par le coordinateur, avec `PaiementsModule`. Le module s'appuie sur les
 * paiements (AM-165) : une réservation est une commande que le voyageur paie avec les routes de
 * paiement existantes ; les remboursements passent par `RemboursementsService`. Il ne modifie ni les
 * paiements, ni la billetterie, ni le schéma Prisma : au démarrage il enveloppe `CommandesAPayer` pour
 * que les paiements reconnaissent ses réservations (README). Les ports de stockage sont remplaçables
 * (versions PostgreSQL à écrire).
 */
@Module({
  imports: [PaiementsModule, SmsModule],
  controllers: [
    CovoiturageVoyageurController,
    CovoiturageConducteurController,
    CovoiturageExploitationController,
  ],
  providers: [
    { provide: Horloge, useClass: HorlogeSysteme },
    {
      provide: CONFIG_COVOITURAGE,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigCovoiturage =>
        chargerConfigCovoiturage(process.env, config.env === "production"),
    },
    Verrous,
    { provide: Trajets, useClass: TrajetsMemoire },
    { provide: Reservations, useClass: ReservationsMemoire },
    { provide: Dossiers, useClass: DossiersMemoire },
    { provide: Versements, useClass: VersementsMemoire },
    { provide: PasserelleVersements, useClass: PasserelleVersementsSimulee },
    { provide: Demandes, useClass: DemandesMemoire },
    { provide: Notes, useClass: NotesMemoire },
    { provide: TrajetsReguliersPassagers, useClass: TrajetsReguliersMemoire },
    { provide: ReferentielCovoiturage, useClass: ReferentielMemoire },
    { provide: AnnuaireCovoiturage, useClass: AnnuaireComptesCovoiturage },
    { provide: NotifieurCovoiturage, useClass: NotifieurSmsCovoiturage },
    { provide: RemboursementsCovoiturage, useClass: RemboursementsViaPaiements },
    VerificationService,
    ReputationService,
    ProfilsService,
    TrajetsService,
    DemandesService,
    LiberationService,
    ReservationsService,
    RechercheService,
    TrajetRegulierService,
    ConducteurService,
    ExploitationCovoiturageService,
    CommandesCovoiturage,
    AbonnementPaiementsCovoiturage,
    BalayageCovoiturage,
    VerificationStockageCovoiturage,
  ],
  exports: [
    RechercheService,
    ReservationsService,
    TrajetsService,
    VerificationService,
    LiberationService,
    CommandesCovoiturage,
    BalayageCovoiturage,
    Trajets,
    Reservations,
    Dossiers,
    Versements,
    PasserelleVersements,
    Demandes,
    Notes,
    TrajetsReguliersPassagers,
    ReferentielCovoiturage,
  ],
})
export class CovoiturageModule {}
