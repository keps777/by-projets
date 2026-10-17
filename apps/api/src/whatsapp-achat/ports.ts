import type { Utilisateur } from "../socle/auth/decorateurs";
import type { Langue } from "./langues";
import type { AchatWhatsApp, ConversationStockee, EntreeJournalAchat, EtatAchat } from "./modeles";

/**
 * Ports de l'achat par WhatsApp : tout ce qu'il lit ou écrit en dehors de la billetterie, des
 * paiements et de la passerelle WhatsApp passe par ces classes abstraites. `memoire.ts` en donne des
 * versions en mémoire (tests, développement) ; les adaptateurs de production les remplacent (tables
 * décrites dans le README). `WhatsAppAchatModule` refuse de démarrer en production tant qu'un port
 * de stockage est en mémoire.
 */

/**
 * Conversations en cours. Chaque message peut tomber sur une autre instance de l'API : en
 * production, un stockage partagé avec expiration (Redis `SET … PX`, ou une table).
 */
export abstract class ConversationsAchat {
  abstract readonly durable: boolean;
  /** `null` si la conversation n'existe pas ou si son échéance est passée. */
  abstract lire(cle: string, maintenant: Date): Promise<ConversationStockee | null>;
  abstract ecrire(conversation: ConversationStockee): Promise<void>;
  abstract supprimer(cle: string): Promise<void>;
  /** Supprime les conversations échues ; renvoie leur nombre. */
  abstract purger(maintenant: Date): Promise<number>;
}

/** Journal technique : de quoi enquêter sans conserver ni numéro, ni message, ni vocal. */
export abstract class JournalAchatWhatsApp {
  abstract readonly durable: boolean;
  abstract enregistrer(entree: EntreeJournalAchat): Promise<void>;
}

/** Achats faits par WhatsApp, de la place retenue jusqu'au billet envoyé. */
export abstract class AchatsWhatsApp {
  abstract readonly durable: boolean;
  abstract ajouter(achat: AchatWhatsApp): Promise<void>;
  abstract trouver(commandeId: string): Promise<AchatWhatsApp | null>;
  /** Comparer et remplacer sur l'état. `null` si l'achat a changé entre-temps. */
  abstract transitionner(
    commandeId: string,
    de: readonly EtatAchat[],
    vers: EtatAchat,
  ): Promise<AchatWhatsApp | null>;
  /** Achats dans l'un de ces états, les plus anciens d'abord. */
  abstract enEtat(etats: readonly EtatAchat[], limite: number): Promise<AchatWhatsApp[]>;
}

/** Le compte du voyageur qui écrit : retrouvé ou créé d'après son numéro WhatsApp. */
export abstract class ComptesAchat {
  /** Lève `CompteAchatInactif` si le compte de ce numéro est désactivé. */
  abstract voyageurDe(msisdn: string): Promise<Utilisateur>;
  /** Premier prénom du compte, `null` s'il n'a pas de nom. */
  abstract prenomDe(voyageurId: string): Promise<string | null>;
}

export class CompteAchatInactif extends Error {
  constructor() {
    super("Compte désactivé");
    this.name = "CompteAchatInactif";
  }
}

/** Les variables du gabarit « billet » de la passerelle WhatsApp (même forme que le SMS). */
export interface VariablesBilletMessage {
  compagnie: string;
  origine: string;
  destination: string;
  departA: Date;
  siege: string;
  code: string;
  lien: string;
}

export interface MessageAchat {
  /** Format international `+237…`. */
  destinataire: string;
  /** Texte libre (1 000 caractères au plus). */
  texte: string;
  /** Idempotence : le même message demandé deux fois n'est envoyé qu'une fois. */
  cle: string;
  compagnieId?: string | null;
  /**
   * Billet payé : si la fenêtre de 24 h est fermée (le texte libre est alors interdit), le billet
   * part par le gabarit approuvé « billet », avec repli par SMS.
   */
  billet?: {
    billetId: string;
    demandeurId: string;
    variables: VariablesBilletMessage;
  };
}

/**
 * Le message ne partira jamais (numéro sans WhatsApp, fenêtre de 24 h fermée sans repli) : inutile
 * de réessayer. Toute autre erreur d'envoi est supposée passagère.
 */
export class EnvoiAchatImpossible extends Error {
  constructor(readonly code: string) {
    super(`Envoi impossible : ${code}`);
    this.name = "EnvoiAchatImpossible";
  }
}

/**
 * Envoi d'un message à un voyageur. L'adaptateur de production est `MessagerieAchatPasserelle`
 * (`PasserelleWhatsAppService.repondre`, AM-167).
 */
export abstract class MessagerieAchat {
  /** `false` pour la version en mémoire. */
  abstract readonly reel: boolean;
  abstract envoyer(message: MessageAchat): Promise<void>;
}

export interface VocalATranscrire {
  /** Identifiant du fichier audio chez WhatsApp. */
  idMedia: string;
  /** Numéro de l'expéditeur, format international. */
  expediteur: string;
}

export interface Transcription {
  texte: string;
  /** Langue reconnue, si le service la donne. */
  langue: Langue | null;
}

/**
 * « Messages vocaux compris » : télécharge le fichier audio chez WhatsApp et le transcrit (français,
 * anglais, pidgin). Aucun adaptateur réel n'est livré : il demande un service de reconnaissance
 * vocale à choisir. L'audio et le texte ne sont jamais conservés ici.
 */
export abstract class TranscriptionVocale {
  /** `false` tant qu'aucun service n'est branché : les vocaux reçoivent alors un message d'excuse. */
  abstract readonly branchee: boolean;
  /** `null` si l'audio est vide ou illisible. Lève en cas de panne du service. */
  abstract transcrire(vocal: VocalATranscrire): Promise<Transcription | null>;
}

/**
 * Reconnaît les numéros de l'équipe (patron, superviseurs) dont les questions vont à l'assistant du
 * rapport du soir, pas à l'achat de billets. Adaptateur réel : l'annuaire des personnes.
 */
export abstract class ReconnaissanceEquipe {
  abstract estEquipe(telephone: string): Promise<boolean>;
}
