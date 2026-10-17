import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
  type Provider,
} from "@nestjs/common";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { CompteWhatsAppService } from "./compte.service";
import { CONFIG_WHATSAPP, chargerConfigWhatsApp, type ConfigWhatsApp } from "./config";
import { DisjoncteurWhatsApp } from "./disjoncteur";
import { FileEnvoiWhatsApp } from "./file";
import { FileEnvoiMemoire } from "./file-memoire";
import { FournisseurWhatsApp } from "./fournisseur";
import { FournisseurWhatsAppHttp, TransportFetch, TransportHttp } from "./fournisseur-http";
import { FournisseurWhatsAppSimule } from "./fournisseur-simule";
import { JournalWhatsApp } from "./journal";
import { JournalWhatsAppMemoire } from "./journal-memoire";
import { AnnuaireRapportMemoire, SourceRapportMemoire } from "./memoire";
import { PasserelleWhatsAppService } from "./passerelle.service";
import {
  AnnuaireRapport,
  GestionnaireEntrants,
  GestionnaireEntrantsAucun,
  SecoursSms,
  SecoursSmsAucun,
  SourceRapportSoir,
} from "./ports";
import { PlanificateurRapportSoir, RapportSoirWhatsAppService } from "./rapport-soir.service";
import { ReceptionWhatsAppService } from "./reception.service";
import { SecoursWhatsAppService } from "./secours.service";
import { WhatsAppController } from "./whatsapp.controller";

/**
 * Garde-fou : en production, refuse de démarrer tant qu'un adaptateur en mémoire est branché
 * (messages, files et rapports seraient perdus au redémarrage), que le fournisseur est simulé, ou
 * que le repli par SMS voulu n'est pas branché.
 */
@Injectable()
export class VerificationWhatsApp implements OnModuleInit {
  constructor(
    @Inject(CONFIG_WHATSAPP) private readonly config: ConfigWhatsApp,
    private readonly journal: JournalWhatsApp,
    private readonly file: FileEnvoiWhatsApp,
    private readonly fournisseur: FournisseurWhatsApp,
    private readonly secours: SecoursSms,
    private readonly source: SourceRapportSoir,
    private readonly annuaire: AnnuaireRapport,
  ) {}

  onModuleInit(): void {
    if (!this.config.production) return;
    const problemes: string[] = [];
    if (!this.journal.durable) {
      problemes.push("le journal WhatsApp est en mémoire (tables whatsapp_*)");
    }
    if (!this.file.durable) problemes.push("la file d'envoi est en mémoire (BullMQ + Redis)");
    if (!this.fournisseur.reel) problemes.push("le fournisseur WhatsApp est simulé");
    if (this.config.secoursSms && !this.secours.branche) {
      problemes.push(
        "le repli par SMS n'est pas branché (SecoursSms) ; WHATSAPP_SECOURS_SMS=false pour s'en passer",
      );
    }
    if (!this.source.reel)
      problemes.push("le rapport du soir n'a pas de source (SourceRapportSoir)");
    if (!this.annuaire.reel) {
      problemes.push("les destinataires du rapport ne sont pas branchés (AnnuaireRapport)");
    }
    if (problemes.length > 0) {
      throw new Error(
        `WhatsAppModule : ${problemes.join(" ; ")}. Brancher les adaptateurs de production ` +
          "avant de démarrer (voir le README de apps/api/src/whatsapp).",
      );
    }
  }
}

/** Branche le traitement de la file sur la passerelle au démarrage, l'arrête à la fermeture. */
@Injectable()
export class TravailleurWhatsApp implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    private readonly file: FileEnvoiWhatsApp,
    private readonly passerelle: PasserelleWhatsAppService,
    @Inject(CONFIG_WHATSAPP) private readonly config: ConfigWhatsApp,
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

/** Adaptateurs de production à brancher à la place de ceux en mémoire (voir `WhatsAppModule.avec`). */
export interface AdaptateursWhatsApp {
  /** Modules qui fournissent ce dont les adaptateurs ont besoin (Prisma, passerelle SMS…). */
  imports?: ModuleMetadata["imports"];
  /**
   * Fournisseurs qui remplacent ceux par défaut : `JournalWhatsApp`, `FileEnvoiWhatsApp`,
   * `SecoursSms`, `SourceRapportSoir`, `AnnuaireRapport`, `GestionnaireEntrants`.
   */
  providers?: Provider[];
}

/**
 * Passerelle WhatsApp Business (AM-167) : gabarits approuvés (rapport du soir, billet, colis,
 * alertes), envoi par file compatible BullMQ, reprise sur échec, repli par SMS, accusés de
 * livraison et messages reçus (webhook signé), état du compte (« vérifié · répond en 2 min »),
 * rapport de 21 h pour le patron et les superviseurs.
 *
 * Module autonome : il n'importe que les modules globaux du socle (configuration, chiffrement,
 * audit). Les ports (journal, file, repli SMS, source du rapport, annuaire, assistant) ont des
 * versions en mémoire ; le coordinateur branche les vraies avec `WhatsAppModule.avec({ … })`
 * (README).
 */
@Module({
  controllers: [WhatsAppController],
  providers: [
    {
      provide: CONFIG_WHATSAPP,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigWhatsApp =>
        chargerConfigWhatsApp(process.env, config.env === "production"),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: JournalWhatsApp, useClass: JournalWhatsAppMemoire },
    {
      provide: FileEnvoiWhatsApp,
      inject: [Horloge, CONFIG_WHATSAPP],
      useFactory: (horloge: Horloge, config: ConfigWhatsApp) =>
        new FileEnvoiMemoire(horloge, config.sondageMs),
    },
    { provide: TransportHttp, useClass: TransportFetch },
    {
      provide: FournisseurWhatsApp,
      inject: [CONFIG_WHATSAPP, TransportHttp, Horloge],
      useFactory: (
        config: ConfigWhatsApp,
        transport: TransportHttp,
        horloge: Horloge,
      ): FournisseurWhatsApp => {
        const f = config.fournisseur;
        if (f.type === "simule") {
          return new FournisseurWhatsAppSimule({
            journaliserContenu: config.journaliserContenuSimule,
            maintenant: () => horloge.maintenant(),
          });
        }
        return new FournisseurWhatsAppHttp(
          {
            urlApi: f.urlApi,
            jeton: f.jeton,
            numeroId: f.numeroId,
            compteId: f.compteId,
            secretApplication: f.secretApplication,
            jetonVerification: f.jetonVerification,
            delaiMs: config.delaiFournisseurMs,
          },
          transport,
        );
      },
    },
    { provide: SecoursSms, useClass: SecoursSmsAucun },
    { provide: SourceRapportSoir, useClass: SourceRapportMemoire },
    { provide: AnnuaireRapport, useClass: AnnuaireRapportMemoire },
    { provide: GestionnaireEntrants, useClass: GestionnaireEntrantsAucun },
    DisjoncteurWhatsApp,
    SecoursWhatsAppService,
    PasserelleWhatsAppService,
    ReceptionWhatsAppService,
    CompteWhatsAppService,
    RapportSoirWhatsAppService,
    PlanificateurRapportSoir,
    VerificationWhatsApp,
    TravailleurWhatsApp,
  ],
  exports: [
    PasserelleWhatsAppService,
    RapportSoirWhatsAppService,
    CompteWhatsAppService,
    JournalWhatsApp,
    FileEnvoiWhatsApp,
  ],
})
export class WhatsAppModule {
  /** Le module avec des adaptateurs de production : les fournisseurs donnés remplacent ceux par défaut. */
  static avec(adaptateurs: AdaptateursWhatsApp): DynamicModule {
    return {
      module: WhatsAppModule,
      imports: adaptateurs.imports ?? [],
      providers: adaptateurs.providers ?? [],
    };
  }
}
