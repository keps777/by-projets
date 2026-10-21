import type { OperateurUssd } from "./config";

/** Ce que les opérateurs envoient et reçoivent, une fois lu par un connecteur. */

/** Une requête de l'opérateur, normalisée. */
export interface EntreeUssd {
  operateur: OperateurUssd;
  /** Identifiant de session fourni par l'opérateur. */
  sessionId: string;
  /** Numéro du téléphone, forme internationale (`+237677012345`). */
  msisdn: string;
  /** Dernière réponse du voyageur (vide à l'ouverture). */
  saisie: string;
  /** Ouverture de session (le voyageur vient de composer le code). */
  nouvelle: boolean;
  /** Le voyageur a quitté la session (l'opérateur le signale) : rien à répondre. */
  fermeture: boolean;
}

/** Ce que l'on répond : un texte, et si la session continue (« CON ») ou se termine (« END »). */
export interface SortieUssd {
  texte: string;
  fin: boolean;
}

/** Les étapes d'une session. */
export type EtapeUssd = "menu" | "numero_proche" | "numero_colis" | "departs" | "confirmation";

/** Ce que la session retient entre deux réponses. Chiffré avant d'être confié au stockage. */
export interface EtatSessionUssd {
  etape: EtapeUssd;
  operateur: OperateurUssd;
  msisdn: string;
  voyageurId: string;
  /** Réponses invalides de suite sur l'écran courant. */
  erreurs: number;
  /** Achat pour un proche : son numéro (le billet part par SMS à ce numéro). */
  proche: string | null;
  /** Les départs proposés (identifiants), dans l'ordre de l'écran. */
  departs: string[];
  /** Commande réservée, en attente de « 1 » pour payer. */
  commandeId: string | null;
  /** Le dernier écran envoyé, réaffiché après une réponse invalide. */
  ecran: string;
}

/** La session telle que le stockage la voit : rien de personnel en clair. */
export interface SessionStockee {
  /** `<opérateur>:<sessionId>`. */
  cle: string;
  expireA: Date;
  /** `EtatSessionUssd` en JSON chiffré (contexte `ussd.session:<cle>`). */
  charge: string;
}

/** Un événement du journal : jamais le contenu des écrans, jamais le numéro en clair. */
export type EvenementJournalUssd =
  | "ouverte"
  | "reponse"
  | "fermee_par_voyageur"
  | "session_expiree"
  | "numero_incoherent"
  | "refus_jeton"
  | "requete_illisible"
  | "erreur"
  | "achat_reserve"
  | "achat_abandonne"
  | "paiement_demande"
  | "paiement_refuse"
  | "mode_degrade"
  | "sms_billet"
  | "sms_billet_echec";

export interface EntreeJournalUssd {
  id: string;
  at: Date;
  operateur: OperateurUssd;
  /** `+237 ••••• 345`. */
  msisdnMasque: string | null;
  /** Début de l'empreinte de la session (jamais l'identifiant de l'opérateur lui-même). */
  sessionRef: string | null;
  evenement: EvenementJournalUssd;
  /** Étape de la session au moment de l'événement. */
  etape: EtapeUssd | null;
  /** Code court (`MODE_DEGRADE`, `SIEGE_PRIS`…) ; jamais un texte d'écran ni un numéro. */
  code: string | null;
  dureeMs: number | null;
}

/** Un achat fait par USSD, suivi jusqu'au SMS du billet. */
export type EtatAchatUssd = "reservee" | "paiement_demande" | "terminee" | "abandonnee";

export interface AchatUssd {
  commandeId: string;
  voyageurId: string;
  operateur: OperateurUssd;
  etat: EtatAchatUssd;
  /** Numéro qui recevra le SMS du billet (le voyageur, ou son proche), chiffré (`ussd.achat:<commandeId>`). */
  destinataireChiffre: string;
  creeA: Date;
}

/** Ce que le suivi d'un colis dit au voyageur. */
export interface ColisSuiviUssd {
  numero: string;
  etat: "depose" | "charge" | "en_route" | "disponible" | "remis";
}

/** La position d'un bus pour l'écran « Suivre bus ». */
export interface PositionBusUssd {
  arriveeEstimee: Date | null;
  retardMinutes: number;
  prochainArret: string | null;
}
