import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { ControleBusService } from "./controle.service";
import {
  ControleGpsController,
  PositionsController,
  VoyageurGpsController,
} from "./gps.controller";
import { SuiviLivraisonService } from "./livraison.service";
import {
  AlertesMemoire,
  AvisMemoire,
  BilletsMemoire,
  DiffusionMemoire,
  EtatsSuiviMemoire,
  MissionsMemoire,
  OffresMemoire,
  PositionsMemoire,
  PrevenirMemoire,
  ProchesMemoire,
  ReseauMemoire,
  type StockageGps,
} from "./memoire";
import { MonteeService } from "./montee.service";
import { OPTIONS_GPS, OPTIONS_GPS_PAR_DEFAUT, PasserelleGps } from "./passerelle";
import {
  AlertesArret,
  AvisSuivi,
  BilletsSuivis,
  DiffusionGps,
  EtatsSuivi,
  MissionsSuivies,
  OffresDeMontee,
  Positions,
  PrevenirProches,
  ProchesASuivre,
  ReseauTransport,
} from "./ports";
import { SuiviBusService } from "./suivi.service";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du suivi GPS est encore en
 * mémoire (positions, état des trajets et alertes seraient perdus au premier redémarrage, et le
 * réseau de transport, les billets, les SMS ne seraient pas branchés).
 */
@Injectable()
export class VerificationStockageGps implements OnModuleInit {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly reseau: ReseauTransport,
    private readonly billets: BilletsSuivis,
    private readonly proches: ProchesASuivre,
    private readonly missions: MissionsSuivies,
    private readonly offres: OffresDeMontee,
    private readonly positions: Positions,
    private readonly etats: EtatsSuivi,
    private readonly alertes: AlertesArret,
    private readonly prevenirs: PrevenirProches,
    private readonly avis: AvisSuivi,
    private readonly diffusion: DiffusionGps,
  ) {}

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const ports: [string, unknown][] = [
      ["ReseauTransport", this.reseau],
      ["BilletsSuivis", this.billets],
      ["ProchesASuivre", this.proches],
      ["MissionsSuivies", this.missions],
      ["OffresDeMontee", this.offres],
      ["Positions", this.positions],
      ["EtatsSuivi", this.etats],
      ["AlertesArret", this.alertes],
      ["PrevenirProches", this.prevenirs],
      ["AvisSuivi", this.avis],
      ["DiffusionGps", this.diffusion],
    ];
    const volatils = ports
      .filter(([, port]) => (port as Partial<StockageGps>).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `GpsModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs ` +
          `PostgreSQL et ceux des autres modules (tables et ports décrits dans ` +
          `apps/api/src/gps/README.md) avant de démarrer en production.`,
      );
    }
  }
}

/**
 * Suivi GPS en temps réel (AM-170) : position des bus (chauffeur et convoyeur) et des livreurs
 * toutes les 30 s, arrivée estimée, retard, alerte d'arrêt anormal, SMS au proche.
 *
 * À importer dans `AppModule` (périmètre du socle). Chaque port est remplaçable : l'intégration
 * branche les adaptateurs PostgreSQL (Positions, EtatsSuivi, AlertesArret, PrevenirProches) et
 * ceux des autres modules (ReseauTransport, BilletsSuivis, ProchesASuivre, MissionsSuivies,
 * OffresDeMontee, AvisSuivi : SMS).
 */
@Module({
  controllers: [PositionsController, VoyageurGpsController, ControleGpsController],
  providers: [
    SuiviBusService,
    SuiviLivraisonService,
    ControleBusService,
    MonteeService,
    PasserelleGps,
    VerificationStockageGps,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: OPTIONS_GPS, useValue: OPTIONS_GPS_PAR_DEFAUT },
    { provide: ReseauTransport, useClass: ReseauMemoire },
    { provide: BilletsSuivis, useClass: BilletsMemoire },
    { provide: ProchesASuivre, useClass: ProchesMemoire },
    { provide: MissionsSuivies, useClass: MissionsMemoire },
    { provide: OffresDeMontee, useClass: OffresMemoire },
    { provide: Positions, useClass: PositionsMemoire },
    { provide: EtatsSuivi, useClass: EtatsSuiviMemoire },
    { provide: AlertesArret, useClass: AlertesMemoire },
    { provide: PrevenirProches, useClass: PrevenirMemoire },
    { provide: AvisSuivi, useClass: AvisMemoire },
    { provide: DiffusionGps, useClass: DiffusionMemoire },
  ],
  exports: [
    SuiviBusService,
    SuiviLivraisonService,
    ControleBusService,
    MonteeService,
    ReseauTransport,
    BilletsSuivis,
    ProchesASuivre,
    MissionsSuivies,
    OffresDeMontee,
    Positions,
    EtatsSuivi,
    AlertesArret,
    PrevenirProches,
    AvisSuivi,
    DiffusionGps,
  ],
})
export class GpsModule {}
