import type {
  AnnulationFaite,
  BilletVendu,
  CaisseDuJour,
  ColisEnregistre,
  CompagnieRapport,
  ContexteQuestion,
  ControleEnRoute,
  DepartDuJour,
  GareRapport,
  QuestionSuggeree,
  RapportSoir,
  TrouNumerotation,
} from "./modele";

/**
 * Ports du rapport du soir. Le module n'a pas de table de ventes : il **lit** ce que les autres
 * modules ont écrit, par ces classes abstraites, et n'écrit que le rapport lui-même.
 *
 * - `memoire.ts` donne une version en mémoire de chaque port (tests, développement).
 * - `ponts.ts` donne des adaptateurs construits sur les ports des modules existants (caisse,
 *   billetterie, numérotation) ; les autres sont des requêtes SQL décrites dans le README.
 * - Un adaptateur en mémoire déclare `durable = false` : `RapportModule` refuse de démarrer en
 *   production tant qu'un port y est encore.
 *
 * Tous les ports de lecture reçoivent une compagnie et un jour de Douala (`AAAA-MM-JJ`) : le
 * rapport d'une compagnie ne lit jamais les données d'une autre.
 */

export interface Durable {
  readonly durable: boolean;
}

/* ------------------------------------------------------------------ référentiel */

/** Les compagnies qui reçoivent un rapport et leurs gares (tables `compagnie` et `gare`). */
export abstract class ReferentielRapport implements Durable {
  abstract readonly durable: boolean;
  abstract compagnies(): Promise<CompagnieRapport[]>;
  abstract compagnie(id: string): Promise<CompagnieRapport | null>;
  /** Les gares de la compagnie, dans l'ordre où elles sont rangées en base. */
  abstract gares(compagnieId: string): Promise<GareRapport[]>;
}

/* ------------------------------------------------------------------ billetterie */

/** Les billets créés pendant le jour (billetterie, AM-162) : guichet, convoyeurs, vendeurs, en ligne. */
export abstract class VentesBillets implements Durable {
  abstract readonly durable: boolean;
  /**
   * Tous les billets de la compagnie dont `cree_a` tombe dans le jour de Douala, **quel que soit
   * leur état** : c'est le rapport qui écarte les annulés et les remplaçants d'un report.
   */
  abstract duJour(compagnieId: string, jour: string): Promise<BilletVendu[]>;
}

/** Les départs du jour (billetterie, AM-162) avec leur remplissage et leur soute (colis, AM-163). */
export abstract class DepartsDuJour implements Durable {
  abstract readonly durable: boolean;
  abstract duJour(compagnieId: string, jour: string): Promise<DepartDuJour[]>;
}

/* ------------------------------------------------------------------ colis */

export abstract class ActiviteColis implements Durable {
  abstract readonly durable: boolean;
  /** Les colis de la compagnie enregistrés pendant le jour, quel que soit leur état. */
  abstract enregistresLe(compagnieId: string, jour: string): Promise<ColisEnregistre[]>;
  /** Les réclamations (litiges) ouvertes pendant le jour sur les colis de la compagnie. */
  abstract litigesOuvertsLe(compagnieId: string, jour: string): Promise<number>;
}

/* ------------------------------------------------------------------ caisse et supervision */

/** Les sessions de caisse ouvertes pendant le jour, validées ou non (caisse et supervision, AM-164). */
export abstract class CaissesDuJour implements Durable {
  abstract readonly durable: boolean;
  abstract duJour(compagnieId: string, jour: string): Promise<CaisseDuJour[]>;
}

/** Les annulations décidées pendant le jour (demandes validées par PIN, annulations en ligne). */
export abstract class AnnulationsDuJour implements Durable {
  abstract readonly durable: boolean;
  abstract duJour(compagnieId: string, jour: string): Promise<AnnulationFaite[]>;
}

/* ------------------------------------------------------------------ numérotation, contrôles */

/** Les trous de numérotation ouverts pour le jour (contrôle de fin de journée, AM-161). */
export abstract class TrousNumerotation implements Durable {
  abstract readonly durable: boolean;
  abstract duJour(compagnieId: string, jour: string): Promise<TrouNumerotation[]>;
}

/** Les contrôles inopinés à bord faits pendant le jour (événements `controle.*` du convoyeur). */
export abstract class ControlesEnRoute implements Durable {
  abstract readonly durable: boolean;
  abstract duJour(compagnieId: string, jour: string): Promise<ControleEnRoute[]>;
}

/* ------------------------------------------------------------------ assistant */

/**
 * La question que le rapport suggère de poser à l'assistant, avec sa réponse déjà préparée
 * (« Pourquoi le 09:30 part si vide ? »). L'assistant (AM-109) est un autre ticket : sans lui,
 * `AssistantRapportAucun` répond `null` et le rapport porte une question vide.
 */
export abstract class AssistantRapport {
  abstract suggerer(contexte: ContexteQuestion): Promise<QuestionSuggeree | null>;
}

export class AssistantRapportAucun extends AssistantRapport {
  async suggerer(): Promise<null> {
    return null;
  }
}

/* ------------------------------------------------------------------ rapports générés */

/**
 * Les rapports générés, en ajout seul (table `rapport_soir`). Un rapport par compagnie et par
 * jour : une fois écrit, il ne change plus, c'est ce que le patron a reçu à 21 h.
 */
export abstract class RapportsSoir implements Durable {
  abstract readonly durable: boolean;
  abstract trouver(compagnieId: string, jour: string): Promise<StockeRapport | null>;
  /**
   * Écrit le rapport s'il n'y en a pas déjà un pour cette compagnie et ce jour
   * (`INSERT … ON CONFLICT (compagnie_id, jour) DO NOTHING`). Répond le rapport qui fait foi :
   * le nouveau, ou celui qu'une autre instance avait écrit en même temps.
   */
  abstract creer(entree: StockeRapport): Promise<{ rapport: StockeRapport; nouveau: boolean }>;
}

export interface StockeRapport {
  compagnieId: string;
  jour: string;
  /** Instant où le rapport a été arrêté et écrit. */
  genereA: string;
  rapport: RapportSoir;
}
