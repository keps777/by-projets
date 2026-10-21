import type { ActionProposee } from "../analyses/modele";
import type { Durable } from "../analyses/ports";
import type { EchangeStocke, Intention, PropositionStockee } from "./modele";

/**
 * Ports de l'assistant. Les faits (départs, caisse, offres publiques, moyennes du réseau) sont lus par
 * les ports du module `analyses` ; ceux-ci ne portent que ce que l'assistant écrit lui-même (la
 * conversation et les propositions), ce qu'il fait quand le patron accepte (`AppliquerActions`) et le
 * modèle de langage. Chaque adaptateur en mémoire est marqué `durable = false` : `VerificationAssistant`
 * refuse de démarrer en production avec l'un d'eux.
 */

/* ------------------------------------------------------------------ conversation */

/** Table `assistant_echange` : une ligne par question posée, ajout seul. */
export abstract class ConversationsAssistant implements Durable {
  abstract readonly durable: boolean;
  /** Les `limite` derniers échanges de ce patron, du plus ancien au plus récent. */
  abstract derniers(
    compagnieId: string,
    utilisateurId: string,
    limite: number,
  ): Promise<EchangeStocke[]>;
  abstract ajouter(echange: EchangeStocke): Promise<void>;
}

/* ------------------------------------------------------------------ propositions */

/**
 * Table `assistant_proposition` : ce que l'API a proposé. Le patron ne peut appliquer que ce qui s'y
 * trouve, avec les paramètres enregistrés à ce moment-là (pas ceux d'un corps de requête).
 */
export abstract class PropositionsAssistant implements Durable {
  abstract readonly durable: boolean;
  /**
   * Enregistre (ou renouvelle) des propositions. Une proposition déjà appliquée et encore valable reste
   * telle quelle : elle ne redevient pas appliquable avant sa péremption.
   */
  abstract proposer(
    compagnieId: string,
    actions: readonly ActionProposee[],
    proposeeLe: Date,
    expireLe: Date,
  ): Promise<void>;
  abstract trouver(compagnieId: string, actionId: string): Promise<PropositionStockee | null>;
  /**
   * Réserve l'application, de façon atomique : `false` si elle l'est déjà. Deux clics simultanés
   * n'appliquent jamais deux fois.
   */
  abstract reserver(compagnieId: string, actionId: string, par: string, a: Date): Promise<boolean>;
  /** Note la ligne du journal d'audit et l'instant d'effet de l'application réservée. */
  abstract confirmer(
    compagnieId: string,
    actionId: string,
    journalId: string,
    effetA: string,
  ): Promise<void>;
  /** Annule une réservation dont l'application a échoué, pour que le patron puisse réessayer. */
  abstract liberer(compagnieId: string, actionId: string): Promise<void>;
}

/* ------------------------------------------------------------------ appliquer */

export interface DemandeApplication {
  compagnieId: string;
  action: ActionProposee;
  /** Le patron qui a signé. */
  par: { id: string; role: string };
  a: Date;
}

/**
 * Ce que fait réellement une proposition acceptée : programmer le contrôle inopiné, rendre le numéro
 * obligatoire en cadence, décaler ou ajouter un départ. Ces réglages appartiennent au planning et à la
 * caisse (autres tickets) : l'adaptateur de production les appelle. L'adaptateur en mémoire se contente
 * de les noter.
 *
 * Il doit être idempotent par `action.id` et lever une `HttpException` au format de l'API quand
 * l'application n'est plus possible (départ supprimé, règle déjà posée…).
 */
export abstract class AppliquerActions implements Durable {
  abstract readonly durable: boolean;
  /** Rend l'instant d'effet (« dès lundi »), au format ISO de Douala. */
  abstract appliquer(demande: DemandeApplication): Promise<{ effetA: string }>;
}

/* ------------------------------------------------------------------ modèle de langage */

/**
 * Ce que le modèle de langage reçoit pour reformuler une réponse : la question et les faits, tous deux
 * pseudonymisés (aucun nom d'agent ou de chauffeur, aucun numéro de téléphone). Il ne reçoit jamais le
 * détail d'un billet, d'un voyageur, ni un chiffre d'une autre compagnie.
 */
export interface DemandeRedaction {
  intention: Intention;
  question: string;
  faits: string[];
  /** Les points numérotés sont-ils attendus ? */
  avecPoints: boolean;
  /** Textes que la réponse doit reprendre mot pour mot. */
  motsObligatoires: string[];
}

export interface Redige {
  resume: string;
  points: string[];
}

/** Ce que le modèle comprend d'une question que les règles ne reconnaissent pas : un choix fermé. */
export interface ChoixInterpretation {
  intention: Exclude<Intention, "ambigue" | "inconnue"> | "inconnue";
  /** Nom de ligne tel qu'il figure dans la liste donnée au modèle. */
  ligne: string | null;
  heure: string | null;
  /** 0 = dimanche … 6 = samedi. */
  jourSemaine: number | null;
  prix: number | null;
}

/**
 * Le modèle de langage. Il n'invente rien : `rediger` reformule des faits que l'API a calculés (la
 * réponse est ensuite vérifiée : tout nombre doit figurer dans les faits), `interpreter` range une
 * question libre dans un choix fermé. Toute erreur ou réponse refusée fait retomber sur les règles.
 */
export abstract class ModeleLangage {
  /** Nom court pour le journal (« claude-sonnet-5-5 », « regles »). */
  abstract readonly nom: string;
  /** `false` : aucun appel externe, les règles écrivent seules. */
  abstract readonly actif: boolean;
  abstract rediger(demande: DemandeRedaction): Promise<Redige | null>;
  abstract interpreter(
    question: string,
    lignes: readonly string[],
  ): Promise<ChoixInterpretation | null>;
}
