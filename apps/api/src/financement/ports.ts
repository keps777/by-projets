import type {
  CompteMarchand,
  ConventionFinancement,
  DossierStocke,
  DossierTransmis,
  LignePaie,
  LotPaie,
  NotificationPartenaire,
  OffreCreditMateriel,
  OperateurMobile,
  PiecesAgence,
  Prelevement,
  ReglagesAgence,
  ReleveMomo,
  Salaire,
  VentesCertifiees,
} from "./modele";

/**
 * Ports du financement : la logique ne parle qu'à ces classes abstraites. `memoire.ts` en fournit des
 * versions en mémoire (tests, développement) ; les adaptateurs PostgreSQL et ceux des partenaires sont
 * écrits par le coordinateur (voir le README). Un port en mémoire ou simulé porte `durable = false` :
 * `FinancementModule` refuse alors de démarrer en production.
 */

/** Marque d'un port en mémoire ou simulé. */
export interface Volatil {
  readonly durable: false;
}

/* ------------------------------------------------------------------ dossiers */

export type ResultatAjoutDossier = "ajoute" | "demande_en_cours" | "numero_pris";

export abstract class DossiersFinancement {
  /**
   * Ajoute le dossier. `demande_en_cours` si l'agence a déjà un dossier ouvert (envoyé, en analyse, ou
   * versé et pas encore remboursé) : contrainte d'unicité, pas une lecture suivie d'une écriture.
   */
  abstract ajouter(dossier: DossierStocke): Promise<ResultatAjoutDossier>;
  /** Le dossier de cette agence : un dossier d'une autre agence n'existe pas. */
  abstract trouver(agenceId: string, id: string): Promise<DossierStocke | null>;
  abstract parReference(referencePartenaire: string): Promise<DossierStocke | null>;
  /** Le dossier qui occupe la place de l'agence, s'il y en a un. */
  abstract ouvert(agenceId: string): Promise<DossierStocke | null>;
  /** Le dossier versé dont le mandat est actif (celui sur lequel on prélève). */
  abstract aPrelever(agenceId: string): Promise<DossierStocke | null>;
  /**
   * Remplace le dossier si sa version est encore `versionAttendue` (incrémentée à l'écriture). `false` si
   * quelqu'un l'a modifié entre-temps : l'appelant relit et recommence.
   */
  abstract remplacer(dossier: DossierStocke, versionAttendue: number): Promise<boolean>;
  /** Envoyés sans accusé du partenaire (envoi à rejouer). */
  abstract nonTransmis(): Promise<DossierStocke[]>;
  /** Transmis, en attente de la décision du partenaire. */
  abstract enAnalyse(): Promise<DossierStocke[]>;
  /** Prochain numéro de l'année, sans trou ni doublon (compteur atomique). */
  abstract prochainNumero(annee: number): Promise<number>;
}

/* ------------------------------------------------------------------ prélèvements */

export type ResultatReservationPrelevement =
  | { resultat: "reserve"; prelevement: Prelevement }
  | { resultat: "existe" }
  | { resultat: "solde_nul" };

export abstract class Prelevements {
  /**
   * Réserve un prélèvement de `min(souhaite, totalDu - déjà réservé)`, atomiquement par dossier (verrou de la
   * ligne du dossier) : deux ventes simultanées ne dépassent jamais ce qui est dû. Idempotent par clé.
   */
  abstract reserver(demande: {
    cle: string;
    dossierId: string;
    agenceId: string;
    venteId: string;
    montantVente: number;
    souhaite: number;
    totalDu: number;
    at: string;
  }): Promise<ResultatReservationPrelevement>;
  abstract confirmer(cle: string, reference: string): Promise<void>;
  /** Le partenaire a refusé pour de bon : la réservation disparaît, l'agence garde cette vente. */
  abstract annuler(cle: string): Promise<void>;
  abstract enAttente(): Promise<Prelevement[]>;
  /** Total réservé (en attente ou exécuté) sur un dossier. */
  abstract totalReserve(dossierId: string): Promise<number>;
  /** Total des prélèvements exécutés par le partenaire sur un dossier. */
  abstract totalExecute(dossierId: string): Promise<number>;
}

/* ------------------------------------------------------------------ paie */

export abstract class LotsPaie {
  /** `false` si l'agence a déjà un lot pour ce mois (unicité `(agence_id, mois)`). */
  abstract creer(lot: LotPaie): Promise<boolean>;
  abstract trouver(agenceId: string, mois: string): Promise<LotPaie | null>;
  /**
   * Modifie une ligne, atomiquement. Si `depuisEtat` est donné, la ligne doit y être encore (sinon `false`) :
   * c'est ce qui empêche deux requêtes de relancer le même salaire.
   */
  abstract marquerLigne(
    lotId: string,
    personneId: string,
    modif: Partial<
      Pick<LignePaie, "etat" | "reference" | "motif" | "tentative" | "operateur" | "telephone">
    >,
    depuisEtat?: LignePaie["etat"],
  ): Promise<boolean>;
  /** Les lots qui ont encore des lignes en attente (tâche de rattrapage). */
  abstract incomplets(): Promise<LotPaie[]>;
}

/** Les salaires du mois d'une agence, calculés sur les trajets et les primes (module équipe). */
export abstract class SalairesAgence {
  abstract calculer(agenceId: string, mois: string): Promise<Salaire[]>;
}

/** L'opérateur a refusé le versement pour de bon (numéro inconnu, solde insuffisant). */
export class VersementRefuse extends Error {
  constructor(message = "Versement refusé par l'opérateur") {
    super(message);
    this.name = "VersementRefuse";
  }
}

export interface DemandeVersementPaie {
  /** Rejouer la même clé ne paie pas deux fois. */
  cle: string;
  agenceId: string;
  operateur: OperateurMobile;
  telephone: string;
  montant: number;
  libelle: string;
}

/**
 * Paie par mobile money, prélevée sur le compte marchand de l'agence : AfriMove ne détient jamais ces
 * fonds, il transmet l'ordre à l'agrégateur (AM-165).
 */
export abstract class VersementsPaie {
  /**
   * Idempotent par `cle`. Lève `VersementRefuse` si l'opérateur refuse pour de bon ; toute autre erreur
   * (réseau, délai) veut dire « résultat inconnu » : la ligne reste en attente et le rattrapage rejoue avec
   * la même clé.
   */
  abstract verser(demande: DemandeVersementPaie): Promise<{ reference: string }>;
}

/* ------------------------------------------------------------------ partenaire financier */

/** Le partenaire refuse définitivement un prélèvement (mandat révoqué, compte clos). */
export class PrelevementRefuse extends Error {
  constructor(message = "Prélèvement refusé par le partenaire") {
    super(message);
    this.name = "PrelevementRefuse";
  }
}

/** Notification illisible ou non authentique (signature, horodatage, format). */
export class NotificationInvalide extends Error {
  constructor(
    readonly raison: "authentification" | "format",
    message: string,
  ) {
    super(message);
    this.name = "NotificationInvalide";
  }
}

export interface RequeteNotification {
  /** En-têtes en minuscules. */
  entetes: Record<string, string | undefined>;
  /** Corps exact reçu : la signature se calcule dessus. */
  corpsBrut: string | null;
}

export type IssueRetrait = "retire" | "deja_verse" | "deja_refuse";

/**
 * L'établissement financier partenaire. Il décide seul, verse et encaisse : AfriMove lui transmet le
 * dossier, exécute le prélèvement convenu **vers le partenaire** et ne touche jamais l'argent.
 */
export abstract class PartenaireFinancier {
  /**
   * Transmet le dossier avec ses pièces ; idempotent par `dossierId` (rejouer renvoie la même référence).
   * Une erreur veut dire « pas reçu » : le dossier reste envoyé et l'envoi est rejoué.
   */
  abstract transmettre(dossier: DossierTransmis): Promise<{ reference: string; accuseA: string }>;
  /** Retire la demande chez le partenaire, sauf s'il a déjà versé ou refusé. */
  abstract retirer(reference: string): Promise<IssueRetrait>;
  /** Où en est le dossier chez le partenaire (rattrapage d'une notification perdue). */
  abstract etat(reference: string): Promise<NotificationPartenaire | null>;
  /**
   * Ordonne un prélèvement sur le compte marchand de l'agence, versé directement au partenaire. Idempotent
   * par `cle`. Lève `PrelevementRefuse` si le partenaire refuse pour de bon ; toute autre erreur est un
   * résultat inconnu : le prélèvement reste en attente et la tâche de fond le rejoue.
   */
  abstract prelever(ordre: {
    cle: string;
    reference: string;
    montant: number;
    venteId: string;
  }): Promise<{ reference: string }>;
  /** Authentifie et lit un appel du partenaire. Lève `NotificationInvalide`. */
  abstract lireNotification(requete: RequeteNotification): Promise<NotificationPartenaire>;
}

/* ------------------------------------------------------------------ données de l'agence */

/** Ce qu'AfriMove sait de l'agence : ventes certifiées, relevés rapprochés, pièces, compte marchand. */
export abstract class DonneesAgence {
  /** Les 90 jours de ventes certifiées qui se terminent à `jusqua`. */
  abstract ventes(agenceId: string, jusqua: string): Promise<VentesCertifiees>;
  abstract releveMomo(agenceId: string, jusqua: string): Promise<ReleveMomo>;
  abstract pieces(agenceId: string): Promise<PiecesAgence>;
  abstract compteMarchand(agenceId: string): Promise<CompteMarchand | null>;
  /** Prix d'un billet VIP de l'agence, pour l'exemple du paiement en 2 fois ; `null` : valeur par défaut. */
  abstract prixBilletExemple(agenceId: string): Promise<number | null>;
}

/** La convention signée (ou pas encore) avec l'établissement partenaire. */
export abstract class ConventionsFinancement {
  abstract pour(agenceId: string): Promise<ConventionFinancement | null>;
}

/** L'offre de crédit matériel faite à l'agence par le partenaire, s'il y en a une. */
export abstract class OffresCredit {
  abstract pour(agenceId: string): Promise<OffreCreditMateriel | null>;
}

/** Réglages de l'agence propres au financement. */
export abstract class ReglagesFinancement {
  abstract lire(agenceId: string): Promise<ReglagesAgence>;
  abstract definirBilletEnDeuxFois(agenceId: string, actif: boolean): Promise<void>;
}
