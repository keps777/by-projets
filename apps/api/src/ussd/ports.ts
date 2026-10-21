import type { Utilisateur } from "../socle/auth/decorateurs";
import type { VariablesBillet } from "../sms/gabarits";
import type {
  AchatUssd,
  ColisSuiviUssd,
  EntreeJournalUssd,
  EtatAchatUssd,
  PositionBusUssd,
  SessionStockee,
} from "./modeles";

/**
 * Ports du service USSD : tout ce qu'il lit ou écrit en dehors de la billetterie et des paiements
 * passe par ces classes abstraites. `memoire.ts` en donne des versions en mémoire (tests,
 * développement) ; les adaptateurs de production les remplacent (tables et Redis décrits dans le
 * README). `UssdModule` refuse de démarrer en production tant qu'un port de stockage est en mémoire.
 */

/** Marque d'un adaptateur qui perd ses données au redémarrage. */
export interface StockageUssd {
  readonly durable: boolean;
}

/**
 * Sessions en cours. Chaque requête de l'opérateur peut tomber sur une autre instance de l'API : en
 * production, un stockage partagé avec expiration (Redis `SET … PX`, ou une table).
 */
export abstract class SessionsUssd {
  abstract readonly durable: boolean;
  /** `null` si la session n'existe pas ou si son échéance est passée. */
  abstract lire(cle: string, maintenant: Date): Promise<SessionStockee | null>;
  abstract ecrire(session: SessionStockee): Promise<void>;
  abstract supprimer(cle: string): Promise<void>;
  /** Supprime les sessions échues ; renvoie leur nombre. */
  abstract purger(maintenant: Date): Promise<number>;
}

/** Journal technique des sessions : de quoi enquêter sans conserver ni numéro ni écran. */
export abstract class JournalUssd {
  abstract readonly durable: boolean;
  abstract enregistrer(entree: EntreeJournalUssd): Promise<void>;
}

/**
 * Achats faits par USSD, du moment où la place est retenue jusqu'au SMS du billet. C'est ce qui
 * permet de libérer une place abandonnée et d'envoyer le SMS une fois le paiement confirmé, même si
 * le webhook arrive sur une autre instance.
 */
export abstract class AchatsUssd {
  abstract readonly durable: boolean;
  abstract ajouter(achat: AchatUssd): Promise<void>;
  abstract trouver(commandeId: string): Promise<AchatUssd | null>;
  /** Comparer et remplacer sur l'état. `null` si l'achat a changé entre-temps. */
  abstract transitionner(
    commandeId: string,
    de: readonly EtatAchatUssd[],
    vers: EtatAchatUssd,
  ): Promise<AchatUssd | null>;
  /** Achats dans l'un de ces états, les plus anciens d'abord. */
  abstract enEtat(etats: readonly EtatAchatUssd[], limite: number): Promise<AchatUssd[]>;
}

/** Le compte du voyageur qui compose le code : retrouvé ou créé d'après son numéro. */
export abstract class ComptesUssd {
  /** Lève `CompteUssdInactif` si le compte de ce numéro est désactivé. */
  abstract voyageurDe(msisdn: string): Promise<Utilisateur>;
}

export class CompteUssdInactif extends Error {
  constructor() {
    super("Compte désactivé");
    this.name = "CompteUssdInactif";
  }
}

export interface DemandeSmsBillet {
  billetId: string;
  destinataire: string;
  variables: VariablesBillet;
  compagnieId: string;
  demandeurId: string;
}

/** Envoi du SMS du billet (code à 4 chiffres et lien). Idempotent par billet et par numéro. */
export abstract class NotifieurBilletUssd {
  abstract readonly reel: boolean;
  abstract envoyer(demande: DemandeSmsBillet): Promise<void>;
}

/**
 * « 3 Colis » : l'état d'un colis d'après son numéro. L'adaptateur ne répond qu'à l'expéditeur ou au
 * destinataire (`msisdn`) et rend `null` pour tout autre : un numéro de colis n'est pas un secret.
 */
export abstract class SuiviColisUssd {
  abstract readonly branche: boolean;
  abstract etat(msisdn: string, numero: string): Promise<ColisSuiviUssd | null>;
}

/** « 4 Suivre bus » : position et retard du bus d'un billet du voyageur. `null` sans position. */
export abstract class SuiviBusUssd {
  abstract readonly branche: boolean;
  abstract position(a: {
    billetId: string;
    departId: string;
    voyageurId: string;
  }): Promise<PositionBusUssd | null>;
}
