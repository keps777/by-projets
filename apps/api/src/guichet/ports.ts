/**
 * Port du module guichet (lot Db, recette AM-181, anomalie A2) : les impressions demandées par les appareils.
 * `memoire.ts` en donne une version en mémoire (tests, développement) ; `postgres.ts` la version PostgreSQL
 * (table `impression_agence`, décrite dans le README). Les deux passent la même suite de contrat
 * (`testing/contrat-ports.ts`). Le module refuse de démarrer en production tant que ce port est en mémoire.
 */

export const DOCUMENTS_IMPRIMABLES = ["billet", "etiquette_colis", "ticket_caisse"] as const;
export type DocumentImprimable = (typeof DOCUMENTS_IMPRIMABLES)[number];

/** Copies qu'une seule demande peut imprimer, au plus (comme le contrat `impression.demandee`). */
export const COPIES_MAX = 5;

export interface ImpressionStockee {
  /** L'identifiant de l'événement `impression.demandee`, créé sur l'appareil : la clé. */
  evenementId: string;
  document: DocumentImprimable;
  /** Identifiant du billet, du colis ou de la session de caisse imprimé. */
  documentId: string;
  copies: number;
  reimpression: boolean;
  auteurId: string;
  appareilId: string;
  compagnieId: string | null;
  /** L'heure de l'événement, sur l'appareil (ISO, Douala). */
  imprimeeA: string;
  /** L'heure à laquelle le serveur l'a reçu. */
  recuA: string;
}

/** Les impressions, en ajout seul : le journal sait combien de copies d'un document existent. */
export abstract class ImpressionsAgence {
  /** `false` en mémoire : le module refuse de démarrer en production. */
  abstract readonly durable: boolean;

  /** Ajoute l'impression. `false` si cet identifiant d'événement y était déjà : rien n'est écrit. */
  abstract ajouter(impression: ImpressionStockee): Promise<boolean>;

  /** Les impressions d'un document, de la plus ancienne à la plus récente. */
  abstract deDocument(
    document: DocumentImprimable,
    documentId: string,
  ): Promise<ImpressionStockee[]>;

  /**
   * Copies imprimées par document, pour chaque identifiant demandé qui en a au moins une (les autres n'y
   * figurent pas). Une seule requête pour tous les identifiants.
   */
  abstract copiesDe(
    document: DocumentImprimable,
    documentIds: readonly string[],
  ): Promise<Map<string, number>>;
}
