import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { VerificateurSignature } from "../modules/signature";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { CabinetService } from "./cabinet.service";
import { ClotureService } from "./cloture.service";
import { ComptableController } from "./comptable.controller";
import { ComptableService } from "./comptable.service";
import { ChargeurMois, ChoixDuMois } from "./donnees.service";
import {
  ActionsMemoire,
  AnnulationsMemoire,
  ClotureMemoire,
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
import { VerrouillageMois } from "./verrouillage.service";

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
 * Module autonome : tous ses accès extérieurs sont des ports (`ports.ts`) avec une version en mémoire
 * (`memoire.ts`). Il n'est pas encore dans `AppModule` : le coordinateur branche les adaptateurs PostgreSQL
 * (tables décrites dans le README), le courriel du cabinet et le remboursement MoMo, puis l'ajoute aux
 * `imports`. `VerrouillageMois` est exporté pour que les autres modules refusent toute écriture datée d'un
 * mois clôturé.
 */
@Module({
  controllers: [ComptableController],
  providers: [
    ComptableService,
    RapprochementService,
    ClotureService,
    CabinetService,
    TachesComptable,
    ChargeurMois,
    ChoixDuMois,
    VerrouillageMois,
    VerificateurSignature,
    VerificationPortsComptable,
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: VentesComptables, useClass: VentesMemoire },
    { provide: SessionsComptables, useClass: SessionsMemoire },
    { provide: AnnulationsComptables, useClass: AnnulationsMemoire },
    { provide: RelevesOperateur, useClass: RelevesMemoire },
    { provide: FaitsRapprochement, useClass: FaitsMemoire },
    { provide: FacturesPayees, useClass: FacturesPayeesMemoire },
    { provide: ParametresRepository, useClass: ParametresMemoire },
    { provide: Clotures, useClass: ClotureMemoire },
    {
      provide: DecisionsRapprochement,
      inject: [Clotures],
      useFactory: (clotures: Clotures) => new DecisionsMemoire(clotures),
    },
    { provide: FichiersApercus, useClass: FichiersApercusMemoire },
    { provide: EnvoisCabinet, useClass: EnvoisMemoire },
    { provide: ActionsRapprochement, useClass: ActionsMemoire },
    { provide: MessagerieCabinet, useClass: MessagerieMemoire },
  ],
  exports: [
    VerrouillageMois,
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
    Clotures,
    FichiersApercus,
    EnvoisCabinet,
    ActionsRapprochement,
    MessagerieCabinet,
  ],
})
export class ComptableModule {}
