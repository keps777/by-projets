import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { normaliserTelephone } from "../socle/comptes/telephone";
import {
  FournisseurWhatsApp,
  type DemandeAbonnement,
  type RecuMessage,
  type RecuStatut,
  type RequeteWebhook,
} from "./fournisseur";
import { JournalWhatsApp } from "./journal";
import { GestionnaireEntrants } from "./ports";
import { masquerNumero } from "./numero";
import { CONTEXTE_DESTINATAIRE, SecoursWhatsAppService } from "./secours.service";
import { STATUTS_EN_ATTENTE, type MessageWhatsApp, type StatutWhatsApp } from "./types";

export interface ResumeWebhook {
  statuts: {
    recus: number;
    appliques: number;
    /** Doublons, retours en arrière (un « envoyé » après un « lu »), messages déjà terminés. */
    ignores: number;
    /** Accusés d'un message que le journal ne connaît pas. */
    inconnus: number;
  };
  messages: {
    recus: number;
    enregistres: number;
    doublons: number;
    /** Numéro illisible. */
    ignores: number;
  };
}

/** Avant que WhatsApp ait accepté le message (un accusé peut précéder l'enregistrement de l'envoi). */
const AVANT_ENVOI: readonly StatutWhatsApp[] = [...STATUTS_EN_ATTENTE, "echec", "expire", "annule"];
const AVANT_REMIS: readonly StatutWhatsApp[] = [...AVANT_ENVOI, "envoye"];
const AVANT_LU: readonly StatutWhatsApp[] = [...AVANT_REMIS, "remis"];
/** Un accusé d'échec ne défait ni une remise ni un échec que la passerelle a déjà constaté. */
const AVANT_NON_REMIS: readonly StatutWhatsApp[] = [...STATUTS_EN_ATTENTE, "envoye"];

/**
 * Reçoit les appels de WhatsApp (webhook) : accusés de livraison qui font avancer le statut des
 * messages, et messages des personnes qui ouvrent la fenêtre de 24 h. Les appels peuvent arriver en
 * double, dans le désordre, ou avant que l'envoi soit enregistré : seul compte le sens
 * `envoyé → remis → lu`, jamais un retour en arrière.
 */
@Injectable()
export class ReceptionWhatsAppService {
  private readonly logger = new Logger("WhatsAppRecus");

  constructor(
    private readonly journal: JournalWhatsApp,
    private readonly fournisseur: FournisseurWhatsApp,
    private readonly chiffrement: ChiffrementService,
    private readonly secours: SecoursWhatsAppService,
    private readonly gestionnaire: GestionnaireEntrants,
  ) {}

  /** Vérification d'abonnement (GET) : rend le `challenge`. Lève `WebhookInvalide`. */
  verifierAbonnement(demande: DemandeAbonnement): string {
    return this.fournisseur.verifierAbonnement(demande);
  }

  /** Lève `WebhookInvalide` (signature, format). */
  async traiter(requete: RequeteWebhook): Promise<ResumeWebhook> {
    const evenements = this.fournisseur.lireWebhook(requete);
    const resume: ResumeWebhook = {
      statuts: { recus: evenements.statuts.length, appliques: 0, ignores: 0, inconnus: 0 },
      messages: { recus: evenements.messages.length, enregistres: 0, doublons: 0, ignores: 0 },
    };
    for (const recu of evenements.statuts) {
      const resultat = await this.appliquerStatut(recu);
      if (resultat === "applique") resume.statuts.appliques += 1;
      else if (resultat === "ignore") resume.statuts.ignores += 1;
      else resume.statuts.inconnus += 1;
    }
    for (const message of evenements.messages) {
      const resultat = await this.enregistrerMessage(message);
      if (resultat === "enregistre") resume.messages.enregistres += 1;
      else if (resultat === "doublon") resume.messages.doublons += 1;
      else resume.messages.ignores += 1;
    }
    return resume;
  }

  /* ------------------------------------------------------------------------------- statuts */

  private async retrouver(recu: RecuStatut): Promise<MessageWhatsApp | null> {
    const parId = await this.journal.trouverParFournisseur(recu.idFournisseur);
    if (parId) return parId;
    if (!recu.reference || !/^[0-9a-f-]{36}$/i.test(recu.reference)) return null;
    // L'accusé a doublé la réponse d'envoi : on le retrouve par notre référence.
    const parReference = await this.journal.trouver(recu.reference);
    return parReference &&
      (parReference.idFournisseur === null || parReference.idFournisseur === recu.idFournisseur)
      ? parReference
      : null;
  }

  private async appliquerStatut(recu: RecuStatut): Promise<"applique" | "ignore" | "inconnu"> {
    const message = await this.retrouver(recu);
    if (!message) {
      this.logger.warn(`Accusé ${recu.etat} pour un message inconnu (${recu.idFournisseur})`);
      return "inconnu";
    }

    const identite = { idFournisseur: recu.idFournisseur, envoyeA: message.envoyeA ?? recu.at };
    let maj: MessageWhatsApp | null;
    if (recu.etat === "envoye") {
      maj = await this.journal.modifier(message.id, { statut: "envoye", ...identite }, AVANT_ENVOI);
    } else if (recu.etat === "remis") {
      maj = await this.journal.modifier(
        message.id,
        {
          statut: "remis",
          ...identite,
          remisA: recu.at,
          derniereErreur: null,
          secoursChiffre: null,
        },
        AVANT_REMIS,
      );
    } else if (recu.etat === "lu") {
      maj = await this.journal.modifier(
        message.id,
        {
          statut: "lu",
          ...identite,
          remisA: message.remisA ?? recu.at,
          luA: recu.at,
          derniereErreur: null,
          secoursChiffre: null,
        },
        AVANT_LU,
      );
    } else {
      maj = await this.journal.modifier(
        message.id,
        { statut: "non_remis", ...identite, derniereErreur: recu.code ?? "non_remis" },
        AVANT_NON_REMIS,
      );
    }
    if (!maj) return "ignore";
    this.logger.log(`WhatsApp ${message.id} (${message.type}) : ${recu.etat} (accusé)`);
    if (recu.etat === "echec") {
      // Le plus souvent : numéro sans WhatsApp. Le SMS prend le relais.
      await this.secours.declencher(message.id, recu.code ?? "non_remis");
    }
    return "applique";
  }

  /* ------------------------------------------------------------------------------ messages */

  private async enregistrerMessage(
    recu: RecuMessage,
  ): Promise<"enregistre" | "doublon" | "ignore"> {
    let telephone: string;
    try {
      telephone = normaliserTelephone(`+${recu.de}`);
    } catch {
      this.logger.warn("Message reçu d'un numéro illisible : ignoré");
      return "ignore";
    }
    const id = randomUUID();
    const nouveau = await this.journal.enregistrerEntrant({
      id,
      idFournisseur: recu.idFournisseur,
      expediteurIndex: this.chiffrement.indexAveugle(telephone, CONTEXTE_DESTINATAIRE),
      expediteurMasque: masquerNumero(telephone),
      typeMessage: recu.typeMessage,
      recuA: recu.at,
      repondueA: null,
      delaiReponseMs: null,
    });
    if (!nouveau) return "doublon";
    try {
      await this.gestionnaire.traiter({
        id,
        de: telephone,
        texte: recu.texte,
        typeMessage: recu.typeMessage,
        recuA: recu.at,
      });
    } catch (e) {
      // Le message est enregistré : rejouer l'appel n'y changerait rien, on ne fait pas échouer le webhook.
      this.logger.error(
        `Message reçu ${id} : le gestionnaire a échoué (${e instanceof Error ? e.name : "erreur"})`,
      );
    }
    return "enregistre";
  }
}
