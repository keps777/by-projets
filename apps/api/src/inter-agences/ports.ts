import type { SignaturePin } from "../modules/commande";
import type { Utilisateur } from "../socle/auth/decorateurs";
import type {
  BilletCorrespondanceStocke,
  BilletEmis,
  ColisInterAgencesStocke,
  CompagnieRef,
  ContestationStockee,
  ConventionStockee,
  DepartInterAgences,
  InvitationStockee,
  MomoCompagnie,
  ReglementStocke,
  StatutContestation,
} from "./modele";

/**
 * Ports du module inter-agences. La logique ne parle qu'à ces classes abstraites ; `memoire.ts` en donne
 * des versions en mémoire (tests, développement). Les tables PostgreSQL attendues par les adaptateurs
 * réels sont décrites dans le README ; l'intégration (Prisma, `AppModule`) est faite par le coordinateur.
 */

/**
 * Un adaptateur en mémoire ou simulé met `durable = false` : le module refuse de démarrer en production
 * tant qu'un port en est encore là.
 */
export interface Volatil {
  readonly durable: false;
}

/* ------------------------------------------------------------------ persistance */

export type ResultatAjoutConvention = "ajoutee" | "paire_deja_ouverte";

export abstract class ConventionsRepository {
  /**
   * Ajoute la convention (version 1). Une seule convention ouverte (`proposee`, `active` ou `suspendue`)
   * par paire de compagnies, quel que soit l'ordre : contrainte d'unicité sur la paire triée.
   */
  abstract ajouter(convention: ConventionStockee): Promise<ResultatAjoutConvention>;
  abstract trouver(id: string): Promise<ConventionStockee | null>;
  /** Les conventions où la compagnie est partie, de la plus récente à la plus ancienne. */
  abstract lister(compagnieId: string): Promise<ConventionStockee[]>;
  /** Les conventions de la paire, quel que soit le statut. */
  abstract entre(compagnieA: string, compagnieB: string): Promise<ConventionStockee[]>;
  abstract toutes(): Promise<ConventionStockee[]>;
  /** Remplace la convention si sa version est encore `versionAttendue` (comparaison et écriture atomiques). */
  abstract remplacer(convention: ConventionStockee, versionAttendue: number): Promise<boolean>;
}

export interface FiltreEchanges {
  /** Les échanges où cette compagnie a un tronçon. */
  compagnieId?: string;
  conventionId?: string;
}

/** Les colis qui changent de compagnie en route : un enregistrement par colis, avec ses passages de témoin. */
export abstract class ColisInterAgences {
  /** `false` si le colis a déjà un plan. */
  abstract ajouter(plan: ColisInterAgencesStocke): Promise<boolean>;
  abstract trouver(colisId: string): Promise<ColisInterAgencesStocke | null>;
  abstract lister(filtre?: FiltreEchanges): Promise<ColisInterAgencesStocke[]>;
  abstract remplacer(plan: ColisInterAgencesStocke, versionAttendue: number): Promise<boolean>;
}

/** Les billets voyageurs en plusieurs tronçons, sous un seul numéro. */
export abstract class BilletsCorrespondance {
  /** `false` si le billet (identifiant ou numéro) a déjà un plan. */
  abstract ajouter(billet: BilletCorrespondanceStocke): Promise<boolean>;
  abstract trouver(id: string): Promise<BilletCorrespondanceStocke | null>;
  abstract trouverParNumero(numero: string): Promise<BilletCorrespondanceStocke | null>;
  abstract lister(filtre?: FiltreEchanges): Promise<BilletCorrespondanceStocke[]>;
  abstract remplacer(billet: BilletCorrespondanceStocke, versionAttendue: number): Promise<boolean>;
}

/** Les règlements arrêtés (un par convention et par lundi). Les créances qu'ils contiennent ne se règlent qu'une fois. */
export abstract class Reglements {
  /** `false` si la clé existe déjà : deux tâches ne règlent pas deux fois le même lundi. */
  abstract ajouter(reglement: ReglementStocke): Promise<boolean>;
  abstract trouver(cle: string): Promise<ReglementStocke | null>;
  abstract lister(conventionId?: string): Promise<ReglementStocke[]>;
  /** Remplace le règlement si son état est encore `etatAttendu` (atomique). */
  abstract remplacer(
    reglement: ReglementStocke,
    etatAttendu: ReglementStocke["etat"],
  ): Promise<boolean>;
}

export abstract class Contestations {
  /** `false` si la référence existe déjà. */
  abstract ajouter(contestation: ContestationStockee): Promise<boolean>;
  abstract trouver(reference: string): Promise<ContestationStockee | null>;
  abstract lister(filtre?: {
    conventionId?: string;
    compagnieId?: string;
    statut?: StatutContestation;
  }): Promise<ContestationStockee[]>;
  /** Remplace la contestation si son statut est encore `statutAttendu` (atomique). */
  abstract remplacer(
    contestation: ContestationStockee,
    statutAttendu: StatutContestation,
  ): Promise<boolean>;
}

export abstract class InvitationsCompagnies {
  abstract parCle(cle: string): Promise<InvitationStockee | null>;
  /** Ajoute l'invitation, ou renvoie celle qui porte déjà la même clé (une par compagnie, numéro et jour). */
  abstract ajouterOuExistante(
    invitation: InvitationStockee,
  ): Promise<{ invitation: InvitationStockee; nouvelle: boolean }>;
}

/** Références lisibles (`INV-270105-1`, `CTX-270105-1`) : un compteur par préfixe, sans trou ni doublon. */
export abstract class CompteursReferences {
  /** Prochain numéro du préfixe, à partir de 1. Atomique. */
  abstract prochain(prefixe: string): Promise<number>;
}

/* ------------------------------------------------------------------ lectures dans les autres modules */

/**
 * Les compagnies (table `compagnie` du socle) et le compte qui paie et reçoit leur solde net. Le nom court
 * (« Alpha ») est affiché dans les tableaux ; le compte MoMo est réglé par le patron.
 */
export abstract class AnnuaireCompagnies {
  abstract trouver(id: string): Promise<CompagnieRef | null>;
}

/** Les départs de la billetterie (ligne, gares, heures, bus) qui portent les tronçons. */
export abstract class DepartsInterAgences {
  abstract trouver(id: string): Promise<DepartInterAgences | null>;
  /** Le premier départ de la compagnie sur ce trajet, strictement après `apres`. */
  abstract prochain(critere: {
    compagnieId: string;
    origine: string;
    destination: string;
    apres: string;
  }): Promise<DepartInterAgences | null>;
}

/** Les billets vendus (billetterie) : celui qu'on équipe d'un second tronçon. Recherche par identifiant ou par numéro. */
export abstract class BilletsEmis {
  abstract trouver(reference: string): Promise<BilletEmis | null>;
}

/* ------------------------------------------------------------------ argent */

export interface DemandeReglement {
  /** Rejouer la même clé ne paie pas deux fois. */
  cle: string;
  debiteur: { compagnieId: string; momo: MomoCompagnie };
  creancier: { compagnieId: string; momo: MomoCompagnie };
  montant: number;
  libelle: string;
}

/** L'opérateur a refusé le règlement pour de bon (compte inconnu, solde insuffisant). */
export class ReglementRefuse extends Error {
  constructor(message = "Règlement refusé par l'opérateur") {
    super(message);
    this.name = "ReglementRefuse";
  }
}

/** Virement du solde net d'une compagnie à l'autre par mobile money (MoMo, Orange Money), branché sur AM-165. */
export abstract class ReglementsMobile {
  /**
   * Idempotent par `cle`. Lève `ReglementRefuse` si l'opérateur refuse pour de bon ; toute autre erreur
   * (réseau, délai dépassé) veut dire « résultat inconnu » : le règlement reste à payer et la tâche de fond
   * le rejoue avec la même clé.
   */
  abstract regler(demande: DemandeReglement): Promise<{ reference: string }>;
}

/**
 * Vérifie le PIN du patron qui signe (convention, sortie). Le PIN est celui du compte connecté ; trois
 * essais faux le bloquent (mêmes compteurs que la connexion).
 */
export abstract class SignaturesPatron {
  abstract verifier(utilisateur: Utilisateur, signature: SignaturePin): Promise<void>;
}
