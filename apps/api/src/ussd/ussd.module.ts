import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnModuleInit,
  type Provider,
} from "@nestjs/common";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { PaiementsModule } from "../paiements/paiements.module";
import { SmsModule } from "../sms/sms.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { NotifieurBilletSms, ComptesUssdComptes } from "./adaptateurs";
import { AchatUssdService } from "./achat.service";
import { CONFIG_USSD, chargerConfigUssd, type ConfigUssd } from "./config";
import { DialogueUssdService } from "./dialogue.service";
import { JournalisationUssd } from "./journalisation.service";
import {
  AchatsUssdMemoire,
  JournalUssdMemoire,
  SessionsMemoire,
  SuiviBusAucun,
  SuiviColisAucun,
} from "./memoire";
import { AchatsUssdPrisma, JournalUssdPrisma, SessionsUssdPrisma } from "./postgres";
import {
  AchatsUssd,
  ComptesUssd,
  JournalUssd,
  NotifieurBilletUssd,
  SessionsUssd,
  SuiviBusUssd,
  SuiviColisUssd,
} from "./ports";
import { SuiviAchatsUssdService } from "./suivi-achats.service";
import { UssdController } from "./ussd.controller";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un adaptateur en mémoire est branché (les
 * sessions ne seraient pas partagées entre instances, les achats à suivre seraient perdus au
 * redémarrage). Le suivi des colis et celui des bus ne sont pas bloquants : leurs touches répondent
 * « introuvable » / « pas de position » tant qu'ils ne sont pas branchés, ce que l'on signale.
 */
@Injectable()
export class VerificationUssd implements OnModuleInit {
  private readonly logger = new Logger("UssdModule");

  constructor(
    @Inject(CONFIG_USSD) private readonly config: ConfigUssd,
    private readonly sessions: SessionsUssd,
    private readonly journal: JournalUssd,
    private readonly achats: AchatsUssd,
    private readonly notifieur: NotifieurBilletUssd,
    private readonly colis: SuiviColisUssd,
    private readonly bus: SuiviBusUssd,
  ) {}

  onModuleInit(): void {
    if (this.config.production) {
      const problemes: string[] = [];
      if (!this.sessions.durable) {
        problemes.push("les sessions sont en mémoire (stockage partagé avec expiration : Redis)");
      }
      if (!this.journal.durable)
        problemes.push("le journal USSD est en mémoire (table ussd_journal)");
      if (!this.achats.durable)
        problemes.push("les achats USSD sont en mémoire (table ussd_achat)");
      if (!this.notifieur.reel)
        problemes.push("le SMS du billet n'est pas branché (NotifieurBilletUssd)");
      if (problemes.length > 0) {
        throw new Error(
          `UssdModule : ${problemes.join(" ; ")}. Brancher les adaptateurs de production ` +
            "avant de démarrer (voir le README de apps/api/src/ussd).",
        );
      }
    }
    if (!this.colis.branche) {
      this.logger.warn("Suivi des colis non branché : la touche 3 répond « colis introuvable ».");
    }
    if (!this.bus.branche) {
      this.logger.warn("Suivi GPS non branché : la touche 4 répond « pas de position ».");
    }
  }
}

/**
 * Les trois ports de stockage du USSD, choisis selon `API_STOCKAGE` : PostgreSQL (`postgres.ts`) ou
 * mémoire. Exportés pour que les tests vérifient le choix sans monter la billetterie et les paiements.
 */
export const FOURNISSEURS_STOCKAGE_USSD: Provider[] = [
  {
    provide: SessionsUssd,
    inject: [CONFIG, PrismaService],
    useFactory: (config: AppConfig, prisma: PrismaService): SessionsUssd =>
      stockageSurPostgres(config) ? new SessionsUssdPrisma(prisma) : new SessionsMemoire(),
  },
  {
    provide: JournalUssd,
    inject: [CONFIG, PrismaService],
    useFactory: (config: AppConfig, prisma: PrismaService): JournalUssd =>
      stockageSurPostgres(config) ? new JournalUssdPrisma(prisma) : new JournalUssdMemoire(),
  },
  {
    provide: AchatsUssd,
    inject: [CONFIG, PrismaService],
    useFactory: (config: AppConfig, prisma: PrismaService): AchatsUssd =>
      stockageSurPostgres(config) ? new AchatsUssdPrisma(prisma) : new AchatsUssdMemoire(),
  },
];

/** Adaptateurs de production à brancher à la place de ceux par défaut (voir `UssdModule.avec`). */
export interface AdaptateursUssd {
  /** Modules qui fournissent ce dont les adaptateurs ont besoin (Redis, Prisma, colis, GPS…). */
  imports?: ModuleMetadata["imports"];
  /**
   * Fournisseurs qui remplacent ceux par défaut : `SessionsUssd`, `JournalUssd`, `AchatsUssd`,
   * `SuiviColisUssd`, `SuiviBusUssd`, `ComptesUssd`, `NotifieurBilletUssd`.
   */
  providers?: Provider[];
}

/**
 * Service USSD *123# (AM-169) : menu (Billet, Mon billet, Colis, Suivre bus, Proche, Aide), achat en
 * trois réponses, paiement MoMo, SMS du billet, connecteurs MTN et Orange, mode dégradé et
 * journalisation.
 *
 * Module autonome : il s'appuie sur la billetterie et les paiements par leurs services exportés,
 * sans les modifier. Les sessions, le journal et les achats suivent `API_STOCKAGE` (PostgreSQL en
 * production, mémoire ailleurs) ; le suivi des colis et celui des bus ont des versions en mémoire que le
 * coordinateur remplace avec `UssdModule.avec({ … })` (README).
 */
@Module({
  imports: [BilletterieModule, PaiementsModule, SmsModule],
  controllers: [UssdController],
  providers: [
    {
      provide: CONFIG_USSD,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigUssd =>
        chargerConfigUssd(process.env, config.env === "production"),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    ...FOURNISSEURS_STOCKAGE_USSD,
    { provide: ComptesUssd, useClass: ComptesUssdComptes },
    { provide: NotifieurBilletUssd, useClass: NotifieurBilletSms },
    { provide: SuiviColisUssd, useClass: SuiviColisAucun },
    { provide: SuiviBusUssd, useClass: SuiviBusAucun },
    JournalisationUssd,
    AchatUssdService,
    DialogueUssdService,
    SuiviAchatsUssdService,
    VerificationUssd,
  ],
  exports: [DialogueUssdService, AchatUssdService, SuiviAchatsUssdService],
})
export class UssdModule {
  /** Le module avec des adaptateurs de production : les fournisseurs donnés remplacent ceux par défaut. */
  static avec(adaptateurs: AdaptateursUssd): DynamicModule {
    return {
      module: UssdModule,
      imports: adaptateurs.imports ?? [],
      providers: adaptateurs.providers ?? [],
    };
  }
}
