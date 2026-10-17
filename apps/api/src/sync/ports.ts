import type { EvenementJournal } from "./protocole";
import type { CleJwk } from "./signature";
import type { GenreNumero, Plage } from "./regles";
import type { OperationSiege } from "./sieges";

/**
 * Ports de persistance de la synchronisation.
 *
 * La logique (rejeu, conflits, blocage) ne parle qu'à ces classes abstraites. `memoire.ts` en
 * fournit des versions en mémoire (tests, développement). **Les versions PostgreSQL ne sont pas
 * écrites** : elles demandent des tables que la migration d'AM-017 n'a pas (`apps/api/prisma/**`,
 * hors du périmètre d'AM-160) ; le README du module liste les tables attendues. Tant que ces ports
 * ne sont pas branchés sur la base, `SyncModule` refuse de démarrer en production.
 */

export interface Octroi {
  option: "synchroniser" | "debloquer_4h" | "telephone_secours";
  superviseurId: string;
  accordeA: string;
  debloqueJusqua: string | null;
}

export interface AppareilSync {
  id: string;
  /** Clé publique (ECDSA P-256) enregistrée à l'installation. */
  cle: CleJwk | null;
  genre: "guichet" | "convoyeur" | "autre";
  /** Rang du guichet (1 à 3) ou du convoyeur dans sa gare. */
  rang: number | null;
  /** Nombre de convoyeurs qui se partagent 3001–3999 (genre convoyeur). */
  nbConvoyeurs: number | null;
  /** Plage attribuée explicitement (AM-161) ; sinon déduite du genre et du rang. */
  plage: Plage | null;
  gareId: string | null;
  compagnieId: string | null;
  /** Dernière synchronisation réussie (ISO Douala). */
  derniereSyncA: string | null;
  /** Plus grand rang de file reçu de cet appareil. */
  dernierOrdre: number;
  /** Déblocage demandé par un superviseur, en attente de lecture par l'appareil. */
  octroi: Octroi | null;
  /** Remplacé par un téléphone de secours. */
  retire: boolean;
}

export type NouvelAppareil = Pick<AppareilSync, "id"> & Partial<Omit<AppareilSync, "id">>;

export abstract class AppareilsSync {
  abstract trouver(id: string): Promise<AppareilSync | null>;
  /** Crée ou complète la fiche d'un appareil (administration : AM-093, AM-120). */
  abstract declarer(appareil: NouvelAppareil): Promise<AppareilSync>;
  abstract enregistrerCle(id: string, cle: CleJwk): Promise<void>;
  abstract mettreAJour(
    id: string,
    changement: Partial<
      Pick<AppareilSync, "derniereSyncA" | "dernierOrdre" | "octroi" | "retire" | "plage">
    >,
  ): Promise<void>;
}

export interface EntreeJournal {
  /** Ordre d'arrivée sur le serveur. */
  seq: number;
  evenement: EvenementJournal;
  recuA: string;
  /** Rang dans la file de l'appareil ; `null` pour un événement produit par le serveur. */
  ordreAppareil: number | null;
  origine: "appareil" | "serveur";
}

/** Journal d'événements en ajout seul. Un UUID n'y entre qu'une fois. */
export abstract class JournalSync {
  abstract existe(id: string): Promise<boolean>;
  /** `null` si l'identifiant était déjà là (rejeu) : rien n'est écrit. */
  abstract ajouter(entree: Omit<EntreeJournal, "seq">): Promise<EntreeJournal | null>;
  abstract lister(filtre?: {
    appareilId?: string;
    type?: string;
    depuisSeq?: number;
  }): Promise<EntreeJournal[]>;
}

export interface ConflitStocke {
  /** Événement du billet perdant. */
  evenementId: string;
  billetId: string;
  departId: string;
  siege: number;
  gagnantBilletId: string;
  appareilId: string;
  auteurId: string;
  detecteA: string;
}

export abstract class SiegesSync {
  /** Ajoute l'opération ; `false` si cet événement y était déjà. */
  abstract ajouterOperation(
    departId: string,
    siege: number,
    operation: OperationSiege,
  ): Promise<boolean>;
  abstract operations(departId: string, siege: number): Promise<OperationSiege[]>;
  abstract billet(billetId: string): Promise<{ departId: string; siege: number } | null>;
  abstract definirBillet(billetId: string, departId: string, siege: number): Promise<void>;
  abstract conflit(evenementId: string): Promise<ConflitStocke | null>;
  abstract conflitsDuSiege(departId: string, siege: number): Promise<ConflitStocke[]>;
  abstract enregistrerConflit(conflit: ConflitStocke): Promise<void>;
  abstract leverConflit(evenementId: string): Promise<void>;
  /**
   * Les billets de cet appareil passés « à replacer » depuis `depuisIso`. Sans état de lecture :
   * si la réponse se perd (application tuée), l'appareil les reverra à la synchronisation suivante.
   */
  abstract conflitsDeAppareil(appareilId: string, depuisIso: string): Promise<ConflitStocke[]>;
}

export type TypeAlerte =
  | "siege_en_conflit"
  | "conflit_leve"
  | "numero_en_double"
  | "numero_hors_plage"
  | "trou_dans_la_plage"
  | "file_avec_trou"
  | "file_reinitialisee"
  | "horloge_en_avance"
  | "deblocage_sur_place"
  | "evenement_rejete";

export interface AlerteSync {
  id: string;
  type: TypeAlerte;
  gravite: "alerte" | "info";
  creeeA: string;
  appareilId: string | null;
  auteurId: string | null;
  evenementId: string | null;
  gareId: string | null;
  compagnieId: string | null;
  /** Le détail nominatif : qui, quel billet, quel siège. */
  details: Record<string, unknown>;
  resolueA: string | null;
}

export abstract class AlertesSync {
  abstract ajouter(alerte: AlerteSync): Promise<void>;
  abstract lister(filtre: {
    gareId?: string | null;
    compagnieId?: string | null;
    ouvertesSeulement?: boolean;
  }): Promise<AlerteSync[]>;
}

/** Ce que l'appareil reçoit pour travailler hors ligne. */
export abstract class ProvisionnementSync {
  /** Départ → sièges que cet appareil peut vendre sans réseau. */
  abstract partsHorsLigne(appareil: AppareilSync): Promise<Record<string, number[]>>;
  /** Vérificateurs de PIN des superviseurs de sa gare (déblocage sur place). */
  abstract verificateursPin(
    appareil: AppareilSync,
  ): Promise<{ superviseurId: string; sel: string; iterations: number; hache: string }[]>;
}

/* ------------------------------------------------------------------ numérotation (AM-161) */

export interface EntreeNumero {
  appareilId: string;
  /** AAMMJJ. */
  jour: string;
  genre: GenreNumero;
  numeroPlage: number;
  evenementId: string;
  /** La plage attribuée à l'appareil, si connue. */
  plage: Plage | null;
}

export interface AnomalieNumero {
  type: "numero_en_double" | "numero_hors_plage";
  numeroPlage: number;
  /** Pour un doublon : l'événement qui avait déjà ce numéro. */
  evenementIdExistant?: string;
}

/**
 * Point d'extension d'AM-161 (« Numérotation sans trou côté serveur et plages ») : vérifier chaque
 * numéro reçu et détecter les trous. L'implémentation par défaut (`ControleNumerosMemoire`) ne
 * détecte que les doublons et les numéros hors plage ; AM-161 la remplace dans le module.
 * Un numéro anormal n'empêche jamais d'enregistrer la vente (le billet est déjà imprimé) : il
 * produit une alerte nominative.
 */
export abstract class ControleNumeros {
  abstract enregistrer(entree: EntreeNumero): Promise<AnomalieNumero[]>;
  /** Numéros manquants entre le début de la plage et le plus grand numéro reçu. */
  abstract trous(
    appareilId: string,
    jour: string,
    genre: GenreNumero,
    plage: Plage,
  ): Promise<number[]>;
}

/** Point d'extension d'AM-161 : quelle plage pour quel appareil. */
export abstract class AttributionPlages {
  abstract plageDe(appareil: AppareilSync): Promise<Plage | null>;
}
