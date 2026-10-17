import type { ExceptionModule, PorteeException, ReglageModule } from "./portee";

/**
 * Ports de persistance du moteur des modules.
 *
 * La logique ne parle qu'à ces classes abstraites. `memoire.ts` en fournit des versions en mémoire
 * (tests, développement). Les versions PostgreSQL sont dans `postgres.ts` (tables `module_compagnie` et
 * `module_exception`) ; mémoire et PostgreSQL passent le même contrat
 * (`postgres.integration.test.ts`). `ModulesModule` choisit l'adaptateur selon `API_STOCKAGE` et
 * refuse de démarrer en production tant qu'un port est en mémoire.
 */

/** Réglages des modules d'une agence. Un module sans ligne est à son état par défaut. */
export abstract class ReglagesModules {
  /** Les modules que l'agence a réglés (les autres n'y figurent pas). */
  abstract lire(agenceId: string): Promise<ReadonlyMap<string, ReglageModule>>;
  /**
   * Règle générale de l'agence. Efface les exceptions du module : « toute l'agence » remet tout à
   * plat, comme sur la planche. Une seule transaction.
   */
  abstract definirAgence(agenceId: string, code: string, actif: boolean): Promise<void>;
  /** Pose (ou remplace) l'exception d'une gare ou d'une ville. */
  abstract poserException(
    agenceId: string,
    code: string,
    exception: ExceptionModule,
  ): Promise<void>;
  /** Retire l'exception d'une gare ou d'une ville : elle retrouve la règle dont elle hérite. */
  abstract retirerException(agenceId: string, code: string, portee: PorteeException): Promise<void>;
}

export interface GareAnnuaire {
  id: string;
  nom: string;
  ville: string;
}

/** Les agences et leurs gares (tables `compagnie` et `gare` du socle). */
export abstract class AnnuaireAgences {
  abstract agenceExiste(agenceId: string): Promise<boolean>;
  abstract gares(agenceId: string): Promise<readonly GareAnnuaire[]>;
}

/**
 * Phrase d'état d'un module (« Douala 12 · Bafoussam 6 »), que seul le module concerné sait
 * produire. `null` : le moteur écrit une phrase générique.
 */
export abstract class DetailsModules {
  abstract detail(agenceId: string, code: string): Promise<string | null>;
}
