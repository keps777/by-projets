import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { VerificateurSignature } from "../modules/signature";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { CabinetService } from "./cabinet.service";
import { ClotureService } from "./cloture.service";
import { ComptableController } from "./comptable.controller";
import { ComptableService } from "./comptable.service";
import { ChargeurMois, ChoixDuMois } from "./donnees.service";
import {
  ActionsMemoire,
  AnnulationsMemoire,
  DecisionsMemoire,
  EnvoisMemoire,
  FacturesPayeesMemoire,
  FaitsMemoire,
  FichiersApercusMemoire,
  MessagerieMemoire,
  ParametresMemoire,
  RelevesMemoire,
  SessionsMemoire,
  VentesMemoire,
} from "./memoire";
import {
  ActionsRapprochementPrisma,
  AnnulationsPrisma,
  DecisionsPrisma,
  EnvoisPrisma,
  FacturesPayeesPrisma,
  FaitsPrisma,
  FichiersApercusPrisma,
  ParametresPrisma,
  RelevesPrisma,
  SessionsPrisma,
  VentesPrisma,
} from "./postgres";
import {
  ActionsRapprochement,
  AnnulationsComptables,
  Clotures,
  DecisionsRapprochement,
  EnvoisCabinet,
  FacturesPayees,
  FaitsRapprochement,
  FichiersApercus,
  MessagerieCabinet,
  ParametresRepository,
  RelevesOperateur,
  SessionsComptables,
  VentesComptables,
} from "./ports";
import { RapprochementService } from "./rapprochement.service";
import { TachesComptable } from "./taches.service";
import { VerrouillageMoisModule } from "./verrouillage.module";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port du module est branché sur la mémoire ou sur un
 * simulateur (les clôtures, les décisions et les envois seraient perdus ou fictifs).
 */
@Injectable()
export class VerificationPortsComptable implements OnModuleInit {
  private readonly ports: [string, unknown][];

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    ventes: VentesComptables,
    sessions: SessionsComptables,
    annulations: AnnulationsComptables,
    releves: RelevesOperateur,
    faits: FaitsRapprochement,
    facturesPayees: FacturesPayees,
    parametres: ParametresRepository,
    decisions: DecisionsRapprochement,
    clotures: Clotures,
    apercus: FichiersApercus,
    envois: EnvoisCabinet,
    actions: ActionsRapprochement,
    messagerie: MessagerieCabinet,
  ) {
    this.ports = [
      ["VentesComptables", ventes],
      ["SessionsComptables", sessions],
      ["AnnulationsComptables", annulations],
      ["RelevesOperateur", releves],
      ["FaitsRapprochement", faits],
      ["FacturesPayees", facturesPayees],
      ["ParametresRepository", parametres],
      ["DecisionsRapprochement", decisions],
      ["Clotures", clotures],
      ["FichiersApercus", apercus],
      ["EnvoisCabinet", envois],
      ["ActionsRapprochement", actions],
      ["MessagerieCabinet", messagerie],
    ];
  }

  onModuleInit(): void {
    if (this.config.env !== "production") return;
    const volatils = this.ports
      .filter(([, port]) => (port as { durable?: boolean }).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `ComptableModule : ${volatils.join(", ")} sont en mémoire ou simulés. Brancher les adaptateurs ` +
          "réels (tables PostgreSQL décrites dans apps/api/src/comptable/README.md) avant de démarrer en production.",
      );
    }
  }
}

/**
 * Exports comptables et rapprochement MoMo (AM-114) : cinq exports à colonnes fixes (journal des ventes,
 * journal de caisse, annulations et remboursements, écritures SYSCOHADA, factures AfriMove) en XLSX, CSV et PDF,
 * signés d'une empreinte ; rapprochement avec les relevés des opérateurs (causes probables, actions rembourser
 * / rattacher / réclamer) ; clôture signée par le PIN qui verrouille le mois ; envoi au cabinet (le 2 du mois
 * et à la clôture).
 *
 * Dans `AppModule`. Les ports ont une version PostgreSQL (`postgres.ts`) et une version en mémoire, choisies
 * par `API_STOCKAGE` (voir `socle/db/stockage.ts`). Restent simulés (le garde-fou de production les nomme) :
 * `MessagerieCabinet` (aucune passerelle de courriel) et le remboursement / la réclamation de
 * `ActionsRapprochement` (le rattachement est réel).
 *
 * Les clôtures et `VerrouillageMois` vivent dans `VerrouillageMoisModule`, importé ici et par la caisse, la
 * billetterie, la synchronisation et les paiements : « un mois verrouillé refuse toute écriture ».
 */
@Module({
  imports: [VerrouillageMoisModule],
  controllers: [ComptableController],
  providers: [
    ComptableService,
    RapprochementService,
    ClotureService,
    CabinetService,
    TachesComptable,
    ChargeurMois,
    ChoixDuMois,
    VerificateurSignature,
    VerificationPortsComptable,
    { provide: Horloge, useClass: HorlogeSysteme },
    {
      provide: VentesComptables,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new VentesPrisma(prisma) : new VentesMemoire(),
    },
    {
      provide: SessionsComptables,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new SessionsPrisma(prisma) : new SessionsMemoire(),
    },
    {
      provide: AnnulationsComptables,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new AnnulationsPrisma(prisma) : new AnnulationsMemoire(),
    },
    {
      provide: RelevesOperateur,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config) ? new RelevesPrisma(prisma, chiffrement) : new RelevesMemoire(),
    },
    {
      provide: FaitsRapprochement,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config) ? new FaitsPrisma(prisma, chiffrement) : new FaitsMemoire(),
    },
    {
      provide: FacturesPayees,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new FacturesPayeesPrisma(prisma)
          : new FacturesPayeesMemoire(),
    },
    {
      provide: ParametresRepository,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config)
          ? new ParametresPrisma(prisma, chiffrement)
          : new ParametresMemoire(),
    },
    {
      provide: DecisionsRapprochement,
      inject: [CONFIG, PrismaService, Clotures],
      useFactory: (config: AppConfig, prisma: PrismaService, clotures: Clotures) =>
        stockageSurPostgres(config) ? new DecisionsPrisma(prisma) : new DecisionsMemoire(clotures),
    },
    {
      provide: FichiersApercus,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new FichiersApercusPrisma(prisma)
          : new FichiersApercusMemoire(),
    },
    {
      provide: EnvoisCabinet,
      inject: [CONFIG, PrismaService, ChiffrementService],
      useFactory: (config: AppConfig, prisma: PrismaService, chiffrement: ChiffrementService) =>
        stockageSurPostgres(config) ? new EnvoisPrisma(prisma, chiffrement) : new EnvoisMemoire(),
    },
    {
      provide: ActionsRapprochement,
      inject: [CONFIG, PrismaService],
      // Le rattachement s'écrit en base ; rembourser et réclamer restent simulés (voir le README).
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config)
          ? new ActionsRapprochementPrisma(prisma, new ActionsMemoire())
          : new ActionsMemoire(),
    },
    { provide: MessagerieCabinet, useClass: MessagerieMemoire },
  ],
  exports: [
    VerrouillageMoisModule,
    ComptableService,
    RapprochementService,
    ClotureService,
    CabinetService,
    TachesComptable,
    VentesComptables,
    SessionsComptables,
    AnnulationsComptables,
    RelevesOperateur,
    FaitsRapprochement,
    FacturesPayees,
    ParametresRepository,
    DecisionsRapprochement,
    FichiersApercus,
    EnvoisCabinet,
    ActionsRapprochement,
    MessagerieCabinet,
  ],
})
export class ComptableModule {}
