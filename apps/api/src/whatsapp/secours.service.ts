import { Inject, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../socle/audit/audit.service";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { CONFIG_WHATSAPP, type ConfigWhatsApp } from "./config";
import { JournalWhatsApp } from "./journal";
import { SecoursSms } from "./ports";
import { estTypeGabarit } from "./gabarits";
import type { EtatSecours, MessageWhatsApp } from "./types";

export const CONTEXTE_DESTINATAIRE = "whatsapp.destinataire";
export const CONTEXTE_SECOURS = "whatsapp.secours";

/** Ce qui est gardé, chiffré, pour pouvoir envoyer le SMS de repli après coup. */
export interface ContenuSecours {
  variables: unknown;
  texte: string;
}

/** Statuts où le message est arrivé (ou ne doit plus partir) : pas de repli. */
const SANS_SECOURS = ["remis", "lu", "annule", "expire"] as const;

/**
 * Repli par SMS. Un message que WhatsApp ne remet pas (échec définitif, essais épuisés, accusé
 * d'échec : numéro sans WhatsApp, téléphone injoignable) est confié à la passerelle SMS, une seule
 * fois (la réservation est atomique et le SMS porte une clé d'idempotence).
 *
 * Le rapport de 21 h est le cas qui compte : le patron doit le recevoir, par WhatsApp ou à défaut
 * par SMS.
 */
@Injectable()
export class SecoursWhatsAppService {
  private readonly logger = new Logger("WhatsAppSecours");

  constructor(
    private readonly journal: JournalWhatsApp,
    private readonly sms: SecoursSms,
    private readonly chiffrement: ChiffrementService,
    private readonly audit: AuditService,
    @Inject(CONFIG_WHATSAPP) private readonly config: ConfigWhatsApp,
  ) {}

  /** Le canal SMS de repli est branché (indépendamment de la configuration). */
  get brancheSms(): boolean {
    return this.sms.branche;
  }

  /** Le repli est voulu et le canal SMS est branché. */
  disponible(): boolean {
    return this.config.secoursSms && this.sms.branche;
  }

  /**
   * Envoie le SMS de repli du message. Rend le nouvel état, ou `null` s'il n'y avait rien à faire
   * (pas de repli prévu, message déjà remis, repli déjà demandé).
   */
  async declencher(messageId: string, raison: string): Promise<EtatSecours | null> {
    if (!this.config.secoursSms) return null;
    const message = await this.journal.trouver(messageId);
    if (!message || message.secoursChiffre === null || message.secours !== "aucun") return null;
    if (!estTypeGabarit(message.type)) return null;
    if ((SANS_SECOURS as readonly string[]).includes(message.statut)) return null;
    if (!(await this.journal.reserverSecours(messageId))) return null;

    try {
      const contenu = this.chiffrement.dechiffrerJson<ContenuSecours>(
        message.secoursChiffre,
        `${CONTEXTE_SECOURS}:${message.id}`,
      );
      const destinataire = this.chiffrement.dechiffrer(
        message.destinataireChiffre,
        `${CONTEXTE_DESTINATAIRE}:${message.id}`,
      );
      const { messageId: smsId } = await this.sms.envoyer({
        type: message.type,
        variables: contenu.variables,
        texte: contenu.texte,
        destinataire,
        cle: `whatsapp-secours:${message.id}`,
        compagnieId: message.compagnieId,
        reference: message.reference,
      });
      await this.journal.modifier(message.id, {
        secours: "sms",
        secoursSmsId: smsId,
        secoursChiffre: null,
      });
      this.logger.warn(`Message ${message.id} (${message.type}) repris par SMS (${raison})`);
      await this.noter("whatsapp.secours_sms", "succes", message, raison);
      return "sms";
    } catch {
      await this.journal.modifier(message.id, { secours: "echec_sms", secoursChiffre: null });
      this.logger.error(
        `Message ${message.id} (${message.type}) : repli par SMS impossible (${raison})`,
      );
      await this.noter("whatsapp.secours_echec", "echec", message, raison);
      return "echec_sms";
    }
  }

  private async noter(
    action: string,
    resultat: "succes" | "echec",
    message: MessageWhatsApp,
    raison: string,
  ): Promise<void> {
    try {
      await this.audit.enregistrer({
        action,
        resultat,
        cible: { type: "whatsapp", id: message.id },
        details: {
          typeWhatsApp: message.type,
          raison,
          compagnieId: message.compagnieId,
          reference: message.reference,
        },
      });
    } catch {
      this.logger.error(`Message ${message.id} : repli non porté au journal d'audit`);
    }
  }
}
