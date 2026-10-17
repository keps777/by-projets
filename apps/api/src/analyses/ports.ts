import type {
  AgentRef,
  AgregatReseau,
  BusRef,
  DepartFait,
  EcartCaisseFait,
  GareRef,
  LigneRef,
  OffrePublique,
  VenteCadenceFait,
} from "./modele";

/**
 * Ports des analyses. Le module n'a **aucune table à lui** : il lit ce que la billetterie, les colis,
 * la caisse et la supervision ont écrit, par ces classes abstraites, et n'écrit rien.
 *
 * - `memoire.ts` donne une version en mémoire de chaque port (tests, développement).
 * - Un adaptateur en mémoire déclare `durable = false` : `AnalysesModule` refuse de démarrer en
 *   production tant qu'un port y est resté. Les requêtes SQL attendues sont dans le README.
 *
 * Tous les ports de lecture reçoivent la compagnie du patron : le module ne lit jamais les billets,
 * la caisse ni la flotte d'une autre compagnie. Les deux seuls ports qui regardent hors de la
 * compagnie (`OffresPubliques`, `ReseauAnonyme`) ne peuvent rendre que des offres publiées et des
 * moyennes anonymes (voir les types).
 */
export interface Durable {
  readonly durable: boolean;
}

/** Lignes, flotte, agents et gares de la compagnie (tables `ligne`, `bus`, `personne`, `gare`). */
export abstract class ReferentielAnalyses implements Durable {
  abstract readonly durable: boolean;
  abstract lignes(compagnieId: string): Promise<LigneRef[]>;
  abstract bus(compagnieId: string): Promise<BusRef[]>;
  abstract agents(compagnieId: string): Promise<AgentRef[]>;
  abstract gares(compagnieId: string): Promise<GareRef[]>;
}

/**
 * Les départs de la compagnie dont le jour tombe dans `[du, au]` (inclus, jours de Douala), avec leurs
 * ventes, leurs colis, leurs incidents et leurs dépenses. Un fait par départ, annulés compris.
 */
export abstract class FaitsDeparts implements Durable {
  abstract readonly durable: boolean;
  abstract entre(compagnieId: string, du: string, au: string): Promise<DepartFait[]>;
}

/** Caisse et ventes en cadence de la compagnie (tables `session_caisse` et `billet`). */
export abstract class FaitsCaisse implements Durable {
  abstract readonly durable: boolean;
  /** Les écarts des caisses clôturées dont le jour tombe dans `[du, au]`, validées ou non. */
  abstract ecarts(compagnieId: string, du: string, au: string): Promise<EcartCaisseFait[]>;
  abstract ventesCadence(compagnieId: string, du: string, au: string): Promise<VenteCadenceFait[]>;
}

/**
 * Les départs que les **autres** compagnies publient sur ces lignes (`ligneCodes`) : horaire et prix,
 * ce que la recherche du voyageur affiche. Jamais leurs ventes. `compagnieId` est la compagnie qui
 * demande, à exclure.
 */
export abstract class OffresPubliques implements Durable {
  abstract readonly durable: boolean;
  abstract entre(
    compagnieId: string,
    ligneCodes: readonly string[],
    du: string,
    au: string,
  ): Promise<OffrePublique[]>;
}

/**
 * Moyennes anonymes du réseau (autres compagnies confondues) par ligne et par créneau d'une heure.
 * L'adaptateur applique le seuil d'anonymat dans la requête (`HAVING count(DISTINCT compagnie_id) >=
 * seuil`) et ne rend ni nom ni identifiant ; le service le revérifie.
 */
export abstract class ReseauAnonyme implements Durable {
  abstract readonly durable: boolean;
  abstract moyennes(
    compagnieId: string,
    ligneCodes: readonly string[],
    du: string,
    au: string,
    seuilCompagnies: number,
  ): Promise<AgregatReseau[]>;
}
