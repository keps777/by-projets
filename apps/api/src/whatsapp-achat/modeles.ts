import type { EntrantRecu } from "../whatsapp/ports";
import type { Langue } from "./langues";

/**
 * Ce que l'achat par WhatsApp garde d'un message à l'autre : l'état de la conversation (chiffré),
 * les achats à suivre jusqu'au billet, le journal technique (sans texte).
 */

/** Un message reçu de WhatsApp, avec, pour un vocal, l'identifiant du média à transcrire. */
export interface EntrantAchat extends EntrantRecu {
  /** Identifiant du fichier audio chez WhatsApp ; absent tant que la passerelle ne le transmet pas. */
  idMedia?: string | null;
}

/** Les étapes d'une conversation d'achat. Sans conversation, un message est une nouvelle demande. */
export type EtapeAchat =
  /** La liste des départs est affichée : le voyageur répond 1, 2 ou 3. */
  | "departs"
  /** « Alpha 08:30, siège 7 fenêtre. 4 000 F par MoMo ? Oui · Changer de siège ». */
  | "confirmation"
  /** La liste des sièges libres est affichée : le voyageur répond un numéro. */
  | "choix_siege"
  /** Le numéro WhatsApp n'est pas un numéro MTN ou Orange : on demande celui à débiter. */
  | "numero_momo"
  /** La demande de paiement est partie ; on attend la confirmation de l'opérateur. */
  | "paiement";

/** Un départ proposé, tel que le voyageur peut le désigner (rang, heure ou compagnie). */
export interface ChoixDepart {
  id: string;
  /** « HH:MM ». */
  heure: string;
  /** Premier mot du nom de la compagnie, sans accent ni majuscule. */
  nom: string;
}

/** L'état d'une conversation. Chiffré avant d'être confié au stockage (il contient le numéro). */
export interface EtatConversation {
  etape: EtapeAchat;
  langue: Langue;
  /** Numéro WhatsApp du voyageur, format international. */
  msisdn: string;
  voyageurId: string;
  /** Réponses qu'on n'a pas comprises, de suite. */
  erreurs: number;
  departs: ChoixDepart[];
  departId: string | null;
  commandeId: string | null;
  siege: number | null;
  /** Sièges montrés à l'étape « choix_siege ». */
  sieges: number[];
  /** Le trajet a été dit en entier (sinon la liste le rappelle). */
  trajetDit: boolean;
}

/** La conversation telle que le stockage la voit : rien de personnel en clair. */
export interface ConversationStockee {
  /** Index aveugle du numéro. */
  cle: string;
  expireA: Date;
  /** `EtatConversation` en JSON chiffré (contexte `whatsapp-achat.conversation:<cle>`). */
  charge: string;
}

export type EvenementJournalAchat =
  | "message"
  | "demande_comprise"
  | "departs_proposes"
  | "aucun_depart"
  | "ville_inconnue"
  | "achat_reserve"
  | "siege_change"
  | "paiement_demande"
  | "paiement_refuse"
  | "paiement_echoue"
  | "place_reprise"
  | "mode_degrade"
  | "achat_annule"
  | "achat_abandonne"
  | "billet_envoye"
  | "billet_envoi_echec"
  | "vocal_transcrit"
  | "vocal_echec"
  | "hors_sujet"
  | "reponse_non_comprise"
  | "reponse_non_envoyee"
  | "erreur";

/** Un événement du journal : jamais le texte d'un message, jamais le numéro en clair. */
export interface EntreeJournalAchat {
  id: string;
  at: Date;
  /** `+237 ••••• 345`. */
  numeroMasque: string | null;
  /** Début de l'empreinte de la conversation (jamais le numéro lui-même). */
  conversationRef: string | null;
  evenement: EvenementJournalAchat;
  etape: EtapeAchat | null;
  langue: Langue | null;
  /** `texte` ou `vocal`. */
  source: "texte" | "vocal" | null;
  /** Code court (`MODE_DEGRADE`, `SIEGE_PRIS`…) ; jamais un texte de message. */
  code: string | null;
  dureeMs: number | null;
}

/**
 * Un achat fait par WhatsApp, suivi jusqu'au billet. C'est ce qui permet de libérer une place
 * abandonnée, d'envoyer le billet une fois le paiement confirmé et de prévenir si le paiement
 * échoue, même si le webhook de paiement arrive sur une autre instance.
 */
export type EtatAchat =
  | "reservee"
  | "paiement_demande"
  | "terminee"
  | "abandonnee"
  /** Paiement non abouti ou place reprise : le voyageur en a été prévenu. */
  | "echouee";

export interface AchatWhatsApp {
  commandeId: string;
  voyageurId: string;
  etat: EtatAchat;
  langue: Langue;
  /** Numéro WhatsApp qui recevra le billet, chiffré (`whatsapp-achat.achat:<commandeId>`). */
  destinataireChiffre: string;
  creeA: Date;
}
