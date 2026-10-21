import { Injectable } from "@nestjs/common";
import type { AchatWhatsApp, ConversationStockee, EntreeJournalAchat, EtatAchat } from "./modeles";
import {
  AchatsWhatsApp,
  ConversationsAchat,
  JournalAchatWhatsApp,
  MessagerieAchat,
  ReconnaissanceEquipe,
  TranscriptionVocale,
  type MessageAchat,
  type Transcription,
  type VocalATranscrire,
} from "./ports";

/**
 * Implémentations en mémoire des ports : tests, développement, démonstration. Rien n'y survit à un
 * redémarrage ni n'est partagé entre instances : `WhatsAppAchatModule` refuse de démarrer en
 * production avec elles (`durable = false`).
 */

@Injectable()
export class ConversationsMemoire extends ConversationsAchat {
  readonly durable = false;
  private readonly conversations = new Map<string, ConversationStockee>();

  async lire(cle: string, maintenant: Date) {
    const c = this.conversations.get(cle);
    if (!c) return null;
    if (c.expireA.getTime() <= maintenant.getTime()) {
      this.conversations.delete(cle);
      return null;
    }
    return { ...c };
  }

  async ecrire(conversation: ConversationStockee) {
    this.conversations.set(conversation.cle, { ...conversation });
  }

  async supprimer(cle: string) {
    this.conversations.delete(cle);
  }

  async purger(maintenant: Date) {
    let n = 0;
    for (const [cle, c] of this.conversations) {
      if (c.expireA.getTime() <= maintenant.getTime()) {
        this.conversations.delete(cle);
        n += 1;
      }
    }
    return n;
  }

  /** Test : les conversations stockées (jamais lisibles : la charge est chiffrée). */
  get toutes(): readonly ConversationStockee[] {
    return [...this.conversations.values()];
  }
}

@Injectable()
export class JournalAchatMemoire extends JournalAchatWhatsApp {
  readonly durable = false;
  /** Au plus ce nombre d'entrées : la mémoire ne grossit pas sans fin. */
  static readonly PLAFOND = 10_000;
  readonly entrees: EntreeJournalAchat[] = [];

  private readonly ids = new Set<string>();

  async enregistrer(entree: EntreeJournalAchat) {
    // Comme `INSERT … ON CONFLICT DO NOTHING` : la même entrée rejouée ne s'écrit pas deux fois.
    if (this.ids.has(entree.id)) return;
    this.ids.add(entree.id);
    this.entrees.push({ ...entree });
    if (this.entrees.length > JournalAchatMemoire.PLAFOND) {
      const ancienne = this.entrees.shift();
      if (ancienne) this.ids.delete(ancienne.id);
    }
  }

  de(evenement: EntreeJournalAchat["evenement"]): EntreeJournalAchat[] {
    return this.entrees.filter((e) => e.evenement === evenement);
  }
}

@Injectable()
export class AchatsMemoire extends AchatsWhatsApp {
  readonly durable = false;
  private readonly achats = new Map<string, AchatWhatsApp>();

  async ajouter(achat: AchatWhatsApp) {
    // Comme `INSERT … ON CONFLICT DO NOTHING` : un achat déjà connu n'est jamais réécrit (il ne
    // repasse pas de « terminé » à « réservé »).
    if (!this.achats.has(achat.commandeId)) this.achats.set(achat.commandeId, { ...achat });
  }

  async trouver(commandeId: string) {
    const a = this.achats.get(commandeId);
    return a ? { ...a } : null;
  }

  async transitionner(commandeId: string, de: readonly EtatAchat[], vers: EtatAchat) {
    const a = this.achats.get(commandeId);
    if (!a || !de.includes(a.etat)) return null;
    const apres = { ...a, etat: vers };
    this.achats.set(commandeId, apres);
    return { ...apres };
  }

  async enEtat(etats: readonly EtatAchat[], limite: number) {
    return [...this.achats.values()]
      .filter((a) => etats.includes(a.etat))
      .sort((a, b) => a.creeA.getTime() - b.creeA.getTime())
      .slice(0, limite)
      .map((a) => ({ ...a }));
  }
}

/**
 * Messages gardés en mémoire (tests) : un seul par clé d'idempotence, comme la passerelle WhatsApp.
 */
@Injectable()
export class MessagerieMemoire extends MessagerieAchat {
  readonly reel = false;
  readonly envoyes: MessageAchat[] = [];
  /** Test : fait échouer les envois suivants. */
  panne = false;

  async envoyer(message: MessageAchat) {
    if (this.panne) throw new Error("WhatsApp indisponible");
    if (this.envoyes.some((m) => m.cle === message.cle)) return;
    this.envoyes.push({ ...message });
  }
}

/** Aucun service de reconnaissance vocale branché : un vocal reçoit un message d'excuse. */
@Injectable()
export class TranscriptionAucune extends TranscriptionVocale {
  readonly branchee = false;

  async transcrire(): Promise<Transcription | null> {
    return null;
  }
}

/** Transcriptions connues d'avance (tests, démonstration), par identifiant de média. */
@Injectable()
export class TranscriptionMemoire extends TranscriptionVocale {
  readonly branchee = true;
  readonly demandes: VocalATranscrire[] = [];
  /** Test : la transcription échoue. */
  panne = false;
  /** Test : la transcription met ce temps à répondre (ms). */
  lenteurMs = 0;
  private readonly connues = new Map<string, Transcription>();

  definir(idMedia: string, transcription: Transcription): this {
    this.connues.set(idMedia, transcription);
    return this;
  }

  async transcrire(vocal: VocalATranscrire): Promise<Transcription | null> {
    this.demandes.push(vocal);
    if (this.lenteurMs > 0) await new Promise((r) => setTimeout(r, this.lenteurMs));
    if (this.panne) throw new Error("Service de reconnaissance vocale indisponible");
    return this.connues.get(vocal.idMedia) ?? null;
  }
}

/** Aucun numéro n'est reconnu comme équipe : tous les messages vont à l'achat. */
@Injectable()
export class EquipeAucune extends ReconnaissanceEquipe {
  async estEquipe(): Promise<boolean> {
    return false;
  }
}

/** Numéros de l'équipe connus d'avance (tests). */
@Injectable()
export class EquipeMemoire extends ReconnaissanceEquipe {
  private readonly numeros = new Set<string>();

  ajouter(...telephones: string[]): this {
    for (const t of telephones) this.numeros.add(t);
    return this;
  }

  async estEquipe(telephone: string): Promise<boolean> {
    return this.numeros.has(telephone);
  }
}
