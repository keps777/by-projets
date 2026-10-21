import type {
  AnnulationComptable,
  ColisSansDepot,
  Cloture,
  DecisionRapprochement,
  EnvoiCabinet,
  FichierGenere,
  IdExport,
  LigneReleve,
  OperateurMomo,
  PaiementExpire,
  ParametresComptables,
  SessionComptable,
  VenteComptable,
  VenteProche,
} from "./modele";

/**
 * Ports du module comptable. La logique ne parle qu'à ces classes abstraites ; `memoire.ts` en donne des
 * versions en mémoire (tests, développement) ; `postgres.ts` en donne les versions PostgreSQL (tables décrites
 * dans le README), choisies par `API_STOCKAGE` dans `ComptableModule`.
 *
 * Trois familles :
 *  - **lectures** chez les autres modules (ventes, sessions de caisse, annulations, relevés des opérateurs) ;
 *  - **écritures** du module (réglages, décisions, clôtures, envois, fichiers) ;
 *  - **effets** vers l'extérieur (remboursement, rattachement, réclamation, envoi au cabinet).
 */

/**
 * Un adaptateur en mémoire ou simulé met `durable = false` : le module refuse de démarrer en
 * production tant qu'un port en est encore là.
 */
export interface Volatil {
  readonly durable: false;
}

/* ------------------------------------------------------------------ lectures chez les autres modules */

export abstract class VentesComptables {
  /**
   * Les billets et colis vendus par la compagnie entre `du` (inclus) et `avant` (exclu), annulés compris
   * (avec leur `annuleeA`). Adaptateur : `billet` et `colis` (+ `paiement` pour la référence opérateur).
   */
  abstract ventes(compagnieId: string, du: string, avant: string): Promise<VenteComptable[]>;
  /** Parmi ces références d'opérateur, celles qu'une vente de la compagnie porte (à n'importe quelle date). */
  abstract referencesConnues(
    compagnieId: string,
    references: readonly string[],
  ): Promise<Set<string>>;
  /** Les mois `AAAA-MM` où la compagnie a vendu quelque chose, du plus récent au plus ancien. */
  abstract moisAvecActivite(compagnieId: string): Promise<string[]>;
}

export abstract class SessionsComptables {
  /** Les sessions de caisse ouvertes entre `du` (inclus) et `avant` (exclu). Adaptateur : `session_caisse`. */
  abstract sessions(compagnieId: string, du: string, avant: string): Promise<SessionComptable[]>;
}

export abstract class AnnulationsComptables {
  /** Les demandes d'annulation décidées entre `du` (inclus) et `avant` (exclu). Adaptateur : `demande_annulation`. */
  abstract decidees(compagnieId: string, du: string, avant: string): Promise<AnnulationComptable[]>;
}

export abstract class RelevesOperateur {
  /**
   * Les lignes des relevés MTN et Orange reçues entre `du` (inclus) et `avant` (exclu) sur le compte
   * marchand de la compagnie. Aucun ticket ne décrit encore leur import : voir le README.
   */
  abstract lignes(compagnieId: string, du: string, avant: string): Promise<LigneReleve[]>;
}

/**
 * Les faits dont le rapprochement a besoin pour deviner la cause d'une transaction sans correspondance.
 * Les règles de décision sont dans `rapprochement.ts` ; le port ne fait que chercher.
 */
export abstract class FaitsRapprochement {
  /** Les ventes payées avec ce numéro autour de cet instant (de part et d'autre, en minutes). */
  abstract ventesAutour(
    compagnieId: string,
    telephone: string,
    autour: string,
    fenetreMinutes: number,
  ): Promise<VenteProche[]>;
  /** Les paiements en ligne de ce numéro expirés avant `avant` (jusqu'à `depuisMinutes` plus tôt). */
  abstract paiementsExpires(
    compagnieId: string,
    telephone: string,
    avant: string,
    depuisMinutes: number,
  ): Promise<PaiementExpire[]>;
  /** Les colis payés à l'arrivée par ce numéro, pour ce montant, que le relais n'a pas scannés au dépôt. */
  abstract colisSansDepot(
    compagnieId: string,
    telephone: string,
    montant: number,
  ): Promise<ColisSansDepot[]>;
  /** Ce numéro a-t-il déjà acheté ou reçu quelque chose chez la compagnie ? */
  abstract numeroConnu(compagnieId: string, telephone: string): Promise<boolean>;
}

/** Les factures hebdomadaires d'AfriMove déjà payées par la compagnie (module de facturation, hors ticket). */
export abstract class FacturesPayees {
  /** Date de paiement (`AAAA-MM-JJ`) des factures dont la semaine finit ces dimanches ; absente = impayée. */
  abstract payees(compagnieId: string, dimanches: readonly string[]): Promise<Map<string, string>>;
}

/* ------------------------------------------------------------------ écritures du module */

export abstract class ParametresRepository {
  abstract lire(compagnieId: string): Promise<ParametresComptables | null>;
  /** Toutes les compagnies qui ont un comptable (tâche d'envoi automatique). */
  abstract toutes(): Promise<ParametresComptables[]>;
}

export type ResultatDecision =
  | { resultat: "ok" }
  /** Une décision existe déjà pour cette référence (définitive). */
  | { resultat: "existe"; existante: DecisionRapprochement }
  /** Le mois est clôturé : il refuse toute écriture. */
  | { resultat: "mois_verrouille" };

export abstract class DecisionsRapprochement {
  abstract lister(compagnieId: string, mois: string): Promise<DecisionRapprochement[]>;
  abstract trouver(
    compagnieId: string,
    mois: string,
    reference: string,
  ): Promise<DecisionRapprochement | null>;
  /**
   * Enregistre la décision si la référence n'en a pas et si le mois n'est pas clôturé, **dans la même
   * transaction** (en SQL : `SELECT … FROM cloture_mois … FOR SHARE` puis `INSERT … ON CONFLICT DO NOTHING`) :
   * une décision ne peut pas entrer dans un mois qui se verrouille au même instant.
   */
  abstract enregistrer(decision: DecisionRapprochement): Promise<ResultatDecision>;
  /** Passe l'exécution à `faite` avec la référence de l'opération (idempotent). */
  abstract confirmer(
    compagnieId: string,
    mois: string,
    reference: string,
    referenceExecution: string,
  ): Promise<void>;
  /** Retire une décision dont l'exécution a été refusée pour de bon (l'opérateur a dit non). */
  abstract retirer(compagnieId: string, mois: string, reference: string): Promise<void>;
  /** Décisions `en_attente`, les plus anciennes d'abord (reprise par la tâche de fond). */
  abstract enAttente(limite: number): Promise<DecisionRapprochement[]>;
}

export abstract class Clotures {
  abstract trouver(compagnieId: string, mois: string): Promise<Cloture | null>;
  /**
   * Ce mois est-il clôturé ? Sans charger les fichiers : c'est la question que tous les modules qui écrivent
   * des ventes, des caisses ou des paiements posent avant chaque écriture (`VerrouillageMois`).
   */
  abstract existe(compagnieId: string, mois: string): Promise<boolean>;
  /** Les mois clôturés de la compagnie, du plus récent au plus ancien. */
  abstract mois(compagnieId: string): Promise<string[]>;
  /**
   * Enregistre la clôture **et ses fichiers** en une seule transaction, sauf si le mois est déjà clôturé
   * (clé primaire `(compagnie_id, mois)`) : de deux clôtures simultanées, une seule gagne. Faux sinon.
   */
  abstract verrouiller(cloture: Cloture): Promise<boolean>;
  /** Note que le cabinet a bien reçu les fichiers (idempotent). */
  abstract marquerRecu(compagnieId: string, mois: string, recuA: string): Promise<void>;
  /** Clôtures dont l'envoi au cabinet est demandé mais pas confirmé, les plus anciennes d'abord. */
  abstract envoisEnAttente(limite: number): Promise<Cloture[]>;
}

/**
 * Le dernier fichier généré pour un export d'un mois ouvert : l'aperçu le mémorise, le téléchargement qui
 * suit de peu rend ce même fichier (« le fichier téléchargé est exactement celui prévisualisé »).
 */
export abstract class FichiersApercus {
  abstract memoriser(compagnieId: string, mois: string, fichier: FichierGenere): Promise<void>;
  abstract dernier(compagnieId: string, mois: string, id: IdExport): Promise<FichierGenere | null>;
}

export abstract class EnvoisCabinet {
  /** Faux si la clé existe déjà : un envoi automatique ne part qu'une fois par mois. */
  abstract enregistrer(envoi: EnvoiCabinet): Promise<boolean>;
  abstract trouver(cle: string): Promise<EnvoiCabinet | null>;
  /** Les derniers envois de la compagnie, du plus récent au plus ancien. */
  abstract derniers(compagnieId: string, limite: number): Promise<EnvoiCabinet[]>;
  abstract marquerRecu(cle: string, recuA: string): Promise<void>;
}

/* ------------------------------------------------------------------ effets vers l'extérieur */

/** L'opérateur ou le module concerné a refusé pour de bon : la décision est annulée. */
export class ActionRefusee extends Error {
  constructor(message = "Action refusée") {
    super(message);
    this.name = "ActionRefusee";
  }
}

export interface ResultatAction {
  /** Référence de l'opération (remboursement, rattachement, réclamation). */
  reference: string;
}

/**
 * Les trois actions du rapprochement. Chacune est **idempotente par `cle`** : la rejouer ne rembourse pas
 * deux fois. Elles lèvent `ActionRefusee` si l'opérateur refuse pour de bon ; toute autre erreur (réseau,
 * délai dépassé) veut dire « résultat inconnu » : la décision reste en attente et la tâche de fond la rejoue.
 * Le numéro du payeur n'est jamais passé : l'adaptateur le retrouve par la référence de l'opérateur.
 */
export abstract class ActionsRapprochement {
  /** Rembourse le montant vers le numéro qui a payé (MoMo vers le même numéro). Branché sur AM-165. */
  abstract rembourser(demande: {
    cle: string;
    reference: string;
    operateur: OperateurMomo;
    montant: number;
  }): Promise<ResultatAction>;
  /** Écrit la référence de l'opérateur sur le colis ou le billet. */
  abstract rattacher(demande: {
    cle: string;
    reference: string;
    cible: string;
  }): Promise<ResultatAction>;
  /** Ouvre une réclamation auprès de l'opérateur (réponse sous 72 h). */
  abstract reclamer(demande: {
    cle: string;
    reference: string;
    operateur: OperateurMomo;
    montant: number;
  }): Promise<ResultatAction>;
}

export interface PieceJointe {
  nom: string;
  typeMime: string;
  contenu: Buffer;
}

export interface MessageCabinet {
  /** Idempotente : rejouer la même clé n'envoie pas deux fois. */
  cle: string;
  destinataire: string;
  objet: string;
  corps: string;
  pieces: PieceJointe[];
}

/**
 * Envoi des fichiers au cabinet comptable. Aucune passerelle de courriel n'existe dans l'API : le
 * coordinateur en branche une. `recuA` est l'instant de l'accusé de réception, nul s'il n'est pas encore arrivé.
 * Une erreur veut dire « pas envoyé » : la tâche de fond réessaie.
 */
export abstract class MessagerieCabinet {
  abstract envoyer(message: MessageCabinet): Promise<{ recuA: string | null }>;
}
