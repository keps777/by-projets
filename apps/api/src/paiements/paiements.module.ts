import { Inject, Injectable, Module, forwardRef, type OnModuleInit } from "@nestjs/common";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { SmsModule } from "../sms/sms.module";
import { VerrouillageMoisModule } from "../comptable/verrouillage.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AbonnementAvisBilletterie, AvisPaiements } from "./avis";
import {
  AnnuaireComptes,
  CommandesBilletterie,
  ConversionDevisesPaiements,
  NotifieurSms,
} from "./adaptateurs";
import { PaiementsAgenceController } from "./agence.controller";
import { AgregateurPaiement } from "./agregateur";
import { AgregateurAbsent } from "./agregateur-absent";
import { AgregateurHttp, TransportFetch, TransportPaiement } from "./agregateur-http";
import { AgregateurSimule } from "./agregateur-simule";
import { BalayagePaiements } from "./balayage";
import { CONFIG_PAIEMENTS, chargerConfigPaiements, type ConfigPaiements } from "./config";
import { DisjoncteurPaiements } from "./disjoncteur";
import { EncaissementsService } from "./encaissements.service";
import { PaiementsExploitationController } from "./exploitation.controller";
import { GardeAgregateur } from "./garde-agregateur";
import { LiensPaiementController } from "./liens.controller";
import { LiensService } from "./liens.service";
import {
  ComptesReversementMemoire,
  LiensPaiementMemoire,
  NotificationsTraiteesMemoire,
  PaiementsMemoire,
  ReglagesPaiementsMemoire,
  RemboursementsMemoire,
} from "./memoire";
import { ModeDegradeService } from "./mode-degrade.service";
import {
  ComptesReversementPrisma,
  LiensPaiementPrisma,
  NotificationsTraiteesPrisma,
  PaiementsPrisma,
  ReglagesPaiementsPrisma,
  RemboursementsPrisma,
} from "./postgres";
import { PaiementsService } from "./paiements.service";
import {
  AnnuaireVoyageurs,
  CommandesAPayer,
  ComptesReversement,
  LiensPaiement,
  NotifieurPaiements,
  NotificationsTraitees,
  Paiements,
  ReglagesPaiements,
  Remboursements,
  type StockagePaiements,
} from "./ports";
import { RemboursementsService } from "./remboursements.service";
import { Verrous } from "./verrous";
import { PaiementsVoyageurController } from "./voyageur.controller";

/** L'agrégateur que la configuration demande : aucun (mode dégradé permanent), simulé ou HTTP. */
export function construireAgregateur(
  config: ConfigPaiements,
  transport: TransportPaiement,
  horloge: Horloge,
): AgregateurPaiement {
  const spec = config.agregateur;
  if (spec.type === "aucun") return new AgregateurAbsent();
  if (spec.type === "simule") {
    return new AgregateurSimule({
      nom: spec.nom,
      issue: spec.issue,
      maintenant: () => horloge.maintenant(),
    });
  }
  return new AgregateurHttp(
    {
      nom: spec.nom,
      urlApi: spec.urlApi,
      cleApi: spec.cleApi,
      secretWebhook: spec.secretWebhook,
      delaiMs: config.delaiAgregateurMs,
    },
    transport,
  );
}

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un port de stockage est en mémoire
 * (paiements, remboursements, événements traités et comptes de reversement seraient perdus au
 * redémarrage : un paiement reçu pourrait être confirmé deux fois ou jamais).
 */
@Injectable()
export class VerificationStockagePaiements implements OnModuleInit {
  constructor(
    @Inject(CONFIG_PAIEMENTS) private readonly config: ConfigPaiements,
    private readonly paiements: Paiements,
    private readonly remboursements: Remboursements,
    private readonly traitees: NotificationsTraitees,
    private readonly liens: LiensPaiement,
    private readonly comptes: ComptesReversement,
    private readonly reglages: ReglagesPaiements,
  ) {}

  onModuleInit(): void {
    if (!this.config.production) return;
    const ports: [string, unknown][] = [
      ["Paiements", this.paiements],
      ["Remboursements", this.remboursements],
      ["NotificationsTraitees", this.traitees],
      ["LiensPaiement", this.liens],
      ["ComptesReversement", this.comptes],
      ["ReglagesPaiements", this.reglages],
    ];
    const volatils = ports
      .filter(([, port]) => (port as Partial<StockagePaiements>).durable === false)
      .map(([nom]) => nom);
    if (volatils.length > 0) {
      throw new Error(
        `PaiementsModule : ${volatils.join(", ")} sont en mémoire. Brancher les adaptateurs ` +
          "PostgreSQL (tables décrites dans apps/api/src/paiements/README.md) avant de démarrer " +
          "en production.",
      );
    }
  }
}

/**
 * Paiements (AM-165) : agrégateur MTN MoMo, Orange Money et cartes, webhooks idempotents,
 * reversement du prix à la compagnie et des frais à AfriMove sur des lignes séparées, lien de
 * paiement pour un proche, remboursements, références opérateur pour le rapprochement, mode dégradé.
 *
 * À importer dans `AppModule` par le coordinateur, avec `rawBody: true` dans `main.ts` (signature
 * du webhook). Le module appelle la billetterie par ses ports et `CommandesService.confirmerPaiement`,
 * la passerelle SMS par `PasserelleSmsService.envoyer` ; il ne modifie ni l'un ni l'autre. Les ports de
 * stockage sont remplaçables (versions PostgreSQL dans `postgres.ts`, choisies par `API_STOCKAGE`) ; `ConversionDevisesPaiements` est à
 * brancher à la place des taux indicatifs de la billetterie (README).
 */
@Module({
  // forwardRef : la billetterie importe aussi ce module (taux de change, `ConversionDevisesPaiements`).
  imports: [forwardRef(() => BilletterieModule), SmsModule, VerrouillageMoisModule],
  controllers: [
    PaiementsVoyageurController,
    LiensPaiementController,
    PaiementsAgenceController,
    PaiementsExploitationController,
  ],
  providers: [
    { provide: Horloge, useClass: HorlogeSysteme },
    {
      provide: CONFIG_PAIEMENTS,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigPaiements =>
        chargerConfigPaiements(process.env, config.env === "production"),
    },
    { provide: TransportPaiement, useClass: TransportFetch },
    {
      provide: AgregateurPaiement,
      inject: [CONFIG_PAIEMENTS, TransportPaiement, Horloge],
      useFactory: construireAgregateur,
    },
    {
      provide: DisjoncteurPaiements,
      inject: [Horloge, CONFIG_PAIEMENTS],
      useFactory: (horloge: Horloge, config: ConfigPaiements) =>
        new DisjoncteurPaiements(() => horloge.maintenant(), config.disjoncteur),
    },
    GardeAgregateur,
    Verrous,
    // Les six ports de stockage : PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire
    // ailleurs (socle/db/stockage.ts).
    {
      provide: Paiements,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): Paiements =>
        stockageSurPostgres(config) ? new PaiementsPrisma(prisma) : new PaiementsMemoire(),
    },
    {
      provide: Remboursements,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): Remboursements =>
        stockageSurPostgres(config)
          ? new RemboursementsPrisma(prisma)
          : new RemboursementsMemoire(),
    },
    {
      provide: NotificationsTraitees,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): NotificationsTraitees =>
        stockageSurPostgres(config)
          ? new NotificationsTraiteesPrisma(prisma)
          : new NotificationsTraiteesMemoire(),
    },
    {
      provide: LiensPaiement,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): LiensPaiement =>
        stockageSurPostgres(config) ? new LiensPaiementPrisma(prisma) : new LiensPaiementMemoire(),
    },
    {
      provide: ComptesReversement,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): ComptesReversement =>
        stockageSurPostgres(config)
          ? new ComptesReversementPrisma(prisma)
          : new ComptesReversementMemoire(),
    },
    {
      provide: ReglagesPaiements,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService): ReglagesPaiements =>
        stockageSurPostgres(config)
          ? new ReglagesPaiementsPrisma(prisma)
          : new ReglagesPaiementsMemoire(),
    },
    { provide: CommandesAPayer, useClass: CommandesBilletterie },
    { provide: NotifieurPaiements, useClass: NotifieurSms },
    { provide: AnnuaireVoyageurs, useClass: AnnuaireComptes },
    ModeDegradeService,
    RemboursementsService,
    EncaissementsService,
    PaiementsService,
    LiensService,
    AvisPaiements,
    AbonnementAvisBilletterie,
    ConversionDevisesPaiements,
    BalayagePaiements,
    VerificationStockagePaiements,
  ],
  exports: [
    PaiementsService,
    EncaissementsService,
    RemboursementsService,
    ModeDegradeService,
    LiensService,
    AvisPaiements,
    ConversionDevisesPaiements,
    GardeAgregateur,
    BalayagePaiements,
    Paiements,
    Remboursements,
    NotificationsTraitees,
    LiensPaiement,
    ComptesReversement,
    ReglagesPaiements,
  ],
})
export class PaiementsModule {}
