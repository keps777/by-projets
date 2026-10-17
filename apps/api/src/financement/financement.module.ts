import { Inject, Injectable, Module, type OnModuleInit } from "@nestjs/common";
import { VerificateurSignature } from "../modules/signature";
import { CONFIG, type AppConfig } from "../socle/config/config";
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
 * (`memoire.ts`). Il n'est pas encore dans `AppModule` : le coordinateur branche les adaptateurs PostgreSQL
 * (tables décrites dans le README), le partenaire, l'agrégateur de versements et les données de l'agence,
 * puis l'ajoute aux `imports`.
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
    { provide: DossiersFinancement, useClass: DossiersMemoire },
    { provide: Prelevements, useClass: PrelevementsMemoire },
    { provide: LotsPaie, useClass: LotsPaieMemoire },
    { provide: SalairesAgence, useClass: SalairesMemoire },
    { provide: VersementsPaie, useClass: VersementsPaieMemoire },
    { provide: PartenaireFinancier, useClass: PartenaireSimule },
    { provide: DonneesAgence, useClass: DonneesAgenceMemoire },
    { provide: ConventionsFinancement, useClass: ConventionsMemoire },
    { provide: OffresCredit, useClass: OffresCreditMemoire },
    { provide: ReglagesFinancement, useClass: ReglagesMemoire },
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
