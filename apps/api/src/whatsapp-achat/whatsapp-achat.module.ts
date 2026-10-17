import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type OnApplicationBootstrap,
  type Provider,
} from "@nestjs/common";
import { BilletterieModule } from "../billetterie/billetterie.module";
import { PaiementsModule } from "../paiements/paiements.module";
import { CONFIG, type AppConfig } from "../socle/config/config";
import { Horloge, HorlogeSysteme } from "../socle/horloge";
import { AchatWhatsAppService } from "./achat.service";
import { ComptesAchatComptes, MessagerieAchatPasserelle } from "./adaptateurs";
import {
  CONFIG_ACHAT_WHATSAPP,
  chargerConfigAchatWhatsApp,
  type ConfigAchatWhatsApp,
} from "./config";
import { ConversationAchatService } from "./conversation.service";
import { GestionnaireEntrantsAchat } from "./gestionnaire";
import { JournalisationAchat } from "./journalisation.service";
import {
  AchatsMemoire,
  ConversationsMemoire,
  EquipeAucune,
  JournalAchatMemoire,
  TranscriptionAucune,
} from "./memoire";
import {
  AchatsWhatsApp,
  ComptesAchat,
  ConversationsAchat,
  JournalAchatWhatsApp,
  MessagerieAchat,
  ReconnaissanceEquipe,
  TranscriptionVocale,
} from "./ports";
import { SuiviAchatsWhatsAppService } from "./suivi-achats.service";

/**
 * Garde-fou. En production, refuse de démarrer tant qu'un adaptateur en mémoire est branché (les
 * conversations ne seraient pas partagées entre instances, les achats à suivre seraient perdus au
 * redémarrage) ou que l'envoi des messages n'est pas branché sur la passerelle WhatsApp. Au
 * démarrage, signale (sans bloquer) ce qui rend l'achat moins complet : pas de transcription des
 * vocaux, pas de passerelle montée.
 */
@Injectable()
export class VerificationAchatWhatsApp implements OnApplicationBootstrap {
  private readonly logger = new Logger("WhatsAppAchatModule");

  constructor(
    @Inject(CONFIG_ACHAT_WHATSAPP) private readonly config: ConfigAchatWhatsApp,
    private readonly conversations: ConversationsAchat,
    private readonly journal: JournalAchatWhatsApp,
    private readonly achats: AchatsWhatsApp,
    private readonly messagerie: MessagerieAchat,
    private readonly transcription: TranscriptionVocale,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.production) {
      const problemes: string[] = [];
      if (!this.conversations.durable) {
        problemes.push(
          "les conversations sont en mémoire (stockage partagé avec expiration : Redis ou table whatsapp_achat_conversation)",
        );
      }
      if (!this.journal.durable) {
        problemes.push("le journal est en mémoire (table whatsapp_achat_journal)");
      }
      if (!this.achats.durable) {
        problemes.push("les achats sont en mémoire (table whatsapp_achat)");
      }
      if (!this.messagerie.reel) {
        problemes.push("l'envoi des messages n'est pas branché (MessagerieAchat)");
      } else if (
        this.messagerie instanceof MessagerieAchatPasserelle &&
        !this.messagerie.disponible()
      ) {
        problemes.push(
          "WhatsAppModule n'est pas monté dans l'application (PasserelleWhatsAppService)",
        );
      }
      if (problemes.length > 0) {
        throw new Error(
          `WhatsAppAchatModule : ${problemes.join(" ; ")}. Brancher les adaptateurs de production ` +
            "avant de démarrer (voir le README de apps/api/src/whatsapp-achat).",
        );
      }
    }
    if (this.config.vocal && !this.transcription.branchee) {
      this.logger.warn(
        "Aucune transcription vocale branchée : les messages vocaux reçoivent un message d'excuse.",
      );
    }
  }
}

/** Adaptateurs de production à brancher à la place de ceux par défaut (voir `WhatsAppAchatModule.avec`). */
export interface AdaptateursAchatWhatsApp {
  /** Modules qui fournissent ce dont les adaptateurs ont besoin (Redis, Prisma, annuaire…). */
  imports?: ModuleMetadata["imports"];
  /**
   * Fournisseurs qui remplacent ceux par défaut : `ConversationsAchat`, `JournalAchatWhatsApp`,
   * `AchatsWhatsApp`, `TranscriptionVocale`, `ReconnaissanceEquipe`, `ComptesAchat`,
   * `MessagerieAchat`, et `GESTIONNAIRE_SUIVANT` (l'assistant du rapport du soir).
   */
  providers?: Provider[];
}

/**
 * Achat conversationnel sur WhatsApp (AM-168) : « Billet Douala Yaoundé demain matin » → 3
 * départs → choix → siège → paiement MoMo → billet, en français, en anglais et en pidgin, par
 * écrit ou par message vocal ; mêmes prix et mêmes règles que l'application et que l'USSD.
 *
 * Module autonome : il s'appuie sur la billetterie et les paiements par leurs services exportés, et
 * sur la passerelle WhatsApp (AM-167) par deux points d'entrée seulement : il fournit le
 * `GestionnaireEntrants` que la passerelle appelle pour chaque message reçu
 * (`GestionnaireEntrantsAchat`), et il envoie ses réponses par `PasserelleWhatsAppService`
 * (retrouvée à l'envoi : le module n'importe pas `WhatsAppModule`). Ses ports (conversations,
 * journal, achats, transcription vocale, équipe) ont des versions en mémoire ; le coordinateur
 * branche les vraies avec `WhatsAppAchatModule.avec({ … })` (README).
 */
@Module({
  imports: [BilletterieModule, PaiementsModule],
  providers: [
    {
      provide: CONFIG_ACHAT_WHATSAPP,
      inject: [CONFIG],
      useFactory: (config: AppConfig): ConfigAchatWhatsApp =>
        chargerConfigAchatWhatsApp(process.env, config.env === "production"),
    },
    { provide: Horloge, useClass: HorlogeSysteme },
    { provide: ConversationsAchat, useClass: ConversationsMemoire },
    { provide: JournalAchatWhatsApp, useClass: JournalAchatMemoire },
    { provide: AchatsWhatsApp, useClass: AchatsMemoire },
    { provide: ComptesAchat, useClass: ComptesAchatComptes },
    { provide: MessagerieAchat, useClass: MessagerieAchatPasserelle },
    { provide: TranscriptionVocale, useClass: TranscriptionAucune },
    { provide: ReconnaissanceEquipe, useClass: EquipeAucune },
    JournalisationAchat,
    AchatWhatsAppService,
    ConversationAchatService,
    SuiviAchatsWhatsAppService,
    GestionnaireEntrantsAchat,
    VerificationAchatWhatsApp,
  ],
  exports: [
    GestionnaireEntrantsAchat,
    ConversationAchatService,
    AchatWhatsAppService,
    SuiviAchatsWhatsAppService,
  ],
})
export class WhatsAppAchatModule {
  /** Le module avec des adaptateurs de production : les fournisseurs donnés remplacent ceux par défaut. */
  static avec(adaptateurs: AdaptateursAchatWhatsApp): DynamicModule {
    return {
      module: WhatsAppAchatModule,
      imports: adaptateurs.imports ?? [],
      providers: adaptateurs.providers ?? [],
    };
  }
}
