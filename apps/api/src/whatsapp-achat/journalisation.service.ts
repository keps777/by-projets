import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { masquerTelephone } from "../paiements/regles";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Horloge } from "../socle/horloge";
import type { Langue } from "./langues";
import type { EtapeAchat, EvenementJournalAchat } from "./modeles";
import { JournalAchatWhatsApp } from "./ports";

export interface FaitAchat {
  evenement: EvenementJournalAchat;
  /** Numéro en clair : seule sa version masquée est conservée. */
  numero?: string | null;
  /** Index aveugle du numéro : seule son empreinte est conservée. */
  conversation?: string | null;
  etape?: EtapeAchat | null;
  langue?: Langue | null;
  source?: "texte" | "vocal" | null;
  /** Code court : `MODE_DEGRADE`, `SIEGE_PRIS`… Jamais un texte de message. */
  code?: string | null;
  dureeMs?: number | null;
}

/**
 * Journal des conversations d'achat (« journalisation » du ticket). Il garde de quoi enquêter sur
 * une plainte (« j'ai payé et rien reçu ») sans rien conserver de personnel : numéro masqué
 * (`+237 ••••• 345`), conversation réduite à une empreinte, aucun texte de message, aucune
 * transcription de vocal. Une panne du journal ne casse jamais une conversation : elle est
 * signalée dans les logs et c'est tout.
 */
@Injectable()
export class JournalisationAchat {
  private readonly logger = new Logger("WhatsAppAchat");

  constructor(
    private readonly journal: JournalAchatWhatsApp,
    private readonly chiffrement: ChiffrementService,
    private readonly horloge: Horloge,
  ) {}

  async noter(fait: FaitAchat): Promise<void> {
    try {
      await this.journal.enregistrer({
        id: randomUUID(),
        at: this.horloge.maintenant(),
        numeroMasque: fait.numero ? masquerTelephone(fait.numero) : null,
        conversationRef: fait.conversation
          ? this.chiffrement
              .indexAveugle(fait.conversation, "whatsapp-achat.conversation-ref")
              .slice(0, 12)
          : null,
        evenement: fait.evenement,
        etape: fait.etape ?? null,
        langue: fait.langue ?? null,
        source: fait.source ?? null,
        code: fait.code ?? null,
        dureeMs: fait.dureeMs ?? null,
      });
    } catch (e) {
      this.logger.error(
        `Journal de l'achat WhatsApp indisponible (${fait.evenement}) : ${e instanceof Error ? e.message : "erreur"}`,
      );
    }
  }
}
