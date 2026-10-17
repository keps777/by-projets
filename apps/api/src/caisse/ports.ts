import type { Coupure } from "./regles";

/**
 * Ports de persistance de la caisse. La logique (ouverture, comptage, clôture, validation) ne parle
 * qu'à ces classes abstraites ; `memoire.ts` en fournit des versions en mémoire pour les tests.
 * Les versions PostgreSQL ne sont pas écrites (tables hors du périmètre : voir le README).
 */

export type EtatSession = "ouverte" | "cloturee" | "validee";

export interface LigneDecompte {
  nombre: number;
  montant: number;
}

export interface Decompte {
  billetsCash: LigneDecompte;
  colisCash: LigneDecompte;
  /** Annulations validées par un superviseur et remboursées en cash : elles sortent de la caisse. */
  annulationsValidees: LigneDecompte;
  /** Le MoMo n'entre pas dans la caisse. */
  momo: { ventes: number; montant: number };
}

export interface ClotureStockee {
  at: string;
  /** Clôture faite par le système à minuit. */
  auto: boolean;
  cashCompte: number;
  /** Le cash attendu calculé par le serveur au moment de la clôture : c'est lui qui fait foi. */
  cashAttendu: number;
  /** compté − attendu (serveur), au franc près. */
  ecart: number;
  /** Cash attendu annoncé par l'appareil − celui du serveur ; 0 si les deux concordent. */
  divergenceAppareil: number;
  /** Clôture automatique sans aucun comptage : le cash compté est inconnu. */
  comptageAbsent: boolean;
  decompte: Decompte;
  evenementId: string;
}

export interface ValidationStockee {
  at: string;
  superviseurId: string;
  superviseurNom: string;
  ecart: number;
  commentaire: string | null;
  evenementId: string;
}

export interface RefusStocke {
  at: string;
  superviseurId: string;
  motif: string | null;
  ecart: number;
  evenementId: string;
}

export interface SessionStockee {
  id: string;
  /** K-GARE-AAMMJJ-GUICHET-N */
  numero: string;
  guichetId: string;
  guichetRang: number;
  gareId: string;
  compagnieId: string | null;
  agentId: string;
  fondDeCaisse: number;
  /** Tolérance de l'agence au moment de l'ouverture (FCFA, valeur absolue). */
  tolerance: number;
  ouverteA: string;
  /** Dernière réouverture après « Refuser · recompter » : la clôture de minuit se compte depuis là. */
  reouverteA: string | null;
  etat: EtatSession;
  comptage: { coupures: Coupure[]; pieces: number; total: number } | null;
  cloture: ClotureStockee | null;
  validation: ValidationStockee | null;
  /** Clôtures refusées avant la clôture actuelle, de la plus ancienne à la plus récente. */
  refus: RefusStocke[];
  evenementOuvertureId: string;
}

export type RefusCreation = "agent_occupe" | "guichet_occupe" | "identifiant_pris" | "numero_pris";

/** Les sessions de caisse. */
export abstract class SessionsCaisse {
  abstract readonly durable: boolean;

  /**
   * Crée la session si l'agent n'en a pas d'autre ouverte, si le guichet est libre et si ni
   * l'identifiant ni le numéro ne sont pris. Atomique (index uniques partiels en base).
   */
  abstract creer(session: SessionStockee): Promise<"ok" | RefusCreation>;
  abstract trouver(id: string): Promise<SessionStockee | null>;
  /**
   * Compare-et-échange : applique `changement` seulement si la session est encore dans l'état
   * `depuis`. Répond la session à jour, ou `null` (absente, ou déjà passée à un autre état).
   */
  abstract transiter(
    id: string,
    depuis: EtatSession,
    changement: Partial<Omit<SessionStockee, "id">>,
  ): Promise<SessionStockee | null>;
  abstract ouverteDeAgent(agentId: string): Promise<SessionStockee | null>;
  /** Les sessions de l'agent, de la plus récente à la plus ancienne. */
  abstract deAgent(agentId: string, depuisIso?: string): Promise<SessionStockee[]>;
  /** Les sessions d'une gare ouvertes depuis `depuisIso` ou encore à valider (clôturées). */
  abstract deGare(gareId: string, depuisIso: string): Promise<SessionStockee[]>;
  /** Toutes les sessions ouvertes (clôture automatique de minuit). */
  abstract ouvertes(): Promise<SessionStockee[]>;
}

/**
 * Ce que l'app a compté depuis l'ouverture. Les ventes cash et les colis viennent du journal des
 * événements (`billet.vendu`, `colis.enregistre`…) ; ce port les agrège pour une session. Les
 * annulations validées en cash sont écrites ici par la supervision.
 */
export abstract class MouvementsCaisse {
  abstract readonly durable: boolean;

  /**
   * Décompte de l'agent au guichet de la session, de l'ouverture de la session à `jusqua` (le début
   * est celui de la session, pas celui de la journée).
   */
  abstract decompte(
    session: Pick<SessionStockee, "id" | "agentId" | "guichetId" | "ouverteA">,
    jusqua: string,
  ): Promise<Decompte>;

  /** Rattache une annulation remboursée en cash à une session. Idempotent par `demandeId`. */
  abstract enregistrerAnnulation(annulation: {
    demandeId: string;
    sessionId: string;
    montant: number;
    at: string;
  }): Promise<void>;
}

export interface GuichetAgence {
  id: string;
  /** Rang 1 à 3 : détermine la plage de numéros. */
  rang: number;
  gareId: string;
  /** Code de la gare à 3 lettres (DLA…), celui du numéro de session. */
  gareCode: string;
  compagnieId: string | null;
}

export abstract class GuichetsAgence {
  abstract readonly durable: boolean;
  abstract trouver(guichetId: string): Promise<GuichetAgence | null>;
}

/** Règles réglables par compagnie (écran « Règles » du patron). */
export abstract class ReglesAgence {
  abstract readonly durable: boolean;
  /** Tolérance d'écart de caisse en FCFA (valeur absolue). */
  abstract tolerance(compagnieId: string | null): Promise<number>;
}

export type TypeAlertePatron =
  | "cloture_automatique"
  | "pin_bloque"
  | "compte_desactive"
  | "ecart_hors_tolerance";

export interface AlertePatron {
  type: TypeAlertePatron;
  compagnieId: string | null;
  gareId: string | null;
  /** Une phrase lisible par le patron. */
  message: string;
  /** Qui est concerné (jamais de secret). */
  details: Record<string, unknown>;
}

/** Prévient le patron (centre d'alertes, notification). */
export abstract class AlertesPatron {
  abstract readonly durable: boolean;
  abstract alerter(alerte: AlertePatron): Promise<void>;
}
