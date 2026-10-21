import {
  Inject,
  Injectable,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { PrismaService } from "../socle/db/prisma.service";
import { stockageSurPostgres } from "../socle/db/stockage";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { SmsGateway } from "../socle/sms/sms.gateway";
import { CONFIG_SMS, chargerConfigSms, type ConfigSms } from "./config";
import { Disjoncteur } from "./disjoncteur";
import { FileEnvoiSms } from "./file";
import { FileEnvoiMemoire } from "./file-memoire";
import { TransportFetch, TransportHttp } from "./fournisseur-http";
import { JournalSms } from "./journal";
import { JournalMemoire } from "./journal-memoire";
import { PasserelleSmsService } from "./passerelle.service";
import { JournalSmsPrisma } from "./postgres";
import { ReceptionRecusService } from "./reception.service";
import { RegistreFournisseurs, construireRegistre } from "./registre";
import { SmsController } from "./sms.controller";
import { StatistiquesSmsService } from "./statistiques.service";

/**
 * Garde-fou : en production, refuse de démarrer tant que le journal ou la file sont en mémoire
 * (messages, coûts et envois en cours seraient perdus au redémarrage) ou que le fournisseur
 * principal n'envoie pas vraiment de SMS.
 */
@Injectable()
export class VerificationSms implements OnModuleInit {
  constructor(
    @Inject(CONFIG_SMS) private readonly config: ConfigSms,
    private readonly journal: JournalSms,
    private readonly file: FileEnvoiSms,
    private readonly registre: RegistreFournisseurs,
  ) {}

  onModuleInit(): void {
    if (!this.config.production) return;
    const problemes: string[] = [];
    if (!this.journal.durable) problemes.push("le journal des SMS est en mémoire (tables sms_*)");
    if (!this.file.durable) problemes.push("la file d'envoi est en mémoire (BullMQ + Redis)");
    if (!this.registre.principal.reel) problemes.push("le fournisseur principal est simulé");
    if (problemes.length > 0) {
      throw new Error(
        `SmsModule : ${problemes.join(" ; ")}. Brancher les adaptateurs de production ` +
          "avant de démarrer (voir le README de apps/api/src/sms).",
      );
    }
  }
}

/** Branche le traitement de la file sur la passerelle au démarrage, l'arrête à la fermeture. */
@Injectable()
export class TravailleurSms implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    private readonly file: FileEnvoiSms,
    private readonly passerelle: PasserelleSmsService,
    @Inject(CONFIG_SMS) private readonly config: ConfigSms,
  ) {}

  onApplicationBootstrap(): void {
    this.file.traiter((travail) => this.passerelle.traiter(travail), {
      concurrence: this.config.concurrence,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.file.fermer();
  }
}

/** `SmsGateway` du socle, branché sur la passerelle : OTP et mots de passe SMS passent par la file. */
@Injectable()
export class SmsGatewayPasserelle extends SmsGateway {
  constructor(private readonly passerelle: PasserelleSmsService) {
    super();
  }

  /**
   * Met le message en file (priorité haute) et rend la main. Différence avec le contrat d'origine :
   * un échec d'envoi n'est plus levé ici mais repris par la file puis journalisé. Un code reste
   * valable 5 minutes (`systeme`) : passé ce délai, il n'est plus envoyé.
   */
  async envoyer(telephone: string, message: string): Promise<void> {
    await this.passerelle.envoyer({
      type: "systeme",
      variables: { texte: message },
      destinataire: telephone,
    });
  }
}

/**
 * Passerelle SMS (AM-166) : fournisseurs simulables avec secours et disjoncteur, file compatible
 * BullMQ, gabarits français, reprise sur échec, statuts de livraison, coût par type.
 *
 * Module autonome : il n'importe que les modules globaux du socle (configuration, chiffrement,
 * audit). Les ports de stockage (`JournalSms`, `FileEnvoiSms`) sont remplaçables : le journal a sa
 * version PostgreSQL (`postgres.ts`, choisie par `API_STOCKAGE`), la file Redis (BullMQ) reste à écrire
 * (README). Importé par `AppModule` ; `AuthModule` y prend `SmsGatewayPasserelle` comme `SmsGateway`.
 */
@Module({
  controllers: [SmsController],
  providers: [
    {
      provide: CONFIG_SMS,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigSms =>
        chargerConfigSms(process.env, config.env === "production"),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    // PostgreSQL en production (ou avec API_STOCKAGE=postgres), mémoire ailleurs : voir socle/db/stockage.ts.
    {
      provide: JournalSms,
      inject: [CONFIG, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        stockageSurPostgres(config) ? new JournalSmsPrisma(prisma) : new JournalMemoire(),
    },
    {
      provide: FileEnvoiSms,
      inject: [Horloge, CONFIG_SMS],
      useFactory: (horloge: Horloge, config: ConfigSms) =>
        new FileEnvoiMemoire(horloge, config.sondageMs),
    },
    { provide: TransportHttp, useClass: TransportFetch },
    {
      provide: RegistreFournisseurs,
      inject: [CONFIG_SMS, TransportHttp],
      useFactory: construireRegistre,
    },
    Disjoncteur,
    PasserelleSmsService,
    ReceptionRecusService,
    StatistiquesSmsService,
    VerificationSms,
    TravailleurSms,
    SmsGatewayPasserelle,
  ],
  exports: [
    PasserelleSmsService,
    StatistiquesSmsService,
    SmsGatewayPasserelle,
    JournalSms,
    FileEnvoiSms,
  ],
})
export class SmsModule {}
