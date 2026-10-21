import type {
  ConstatSiege,
  ControleStocke,
  DepenseBord,
  GenrePassage,
  IncidentBord,
  PassageRoute,
  RegularisationControle,
  RetardDepart,
  SiegeConstate,
  SignalementConvoyeur,
  VenteRoute,
} from "./modeles";

/**
 * Ports du bord : tout ce que le module écrit passe par ces classes abstraites. `memoire.ts` en donne des
 * versions en mémoire (tests, développement) et `postgres.ts` des versions PostgreSQL (tables décrites dans
 * le README) ; `testing/contrat-ports.ts` fait passer la même suite aux deux. `BordModule` choisit selon
 * `API_STOCKAGE` et refuse de démarrer en production avec un port en mémoire.
 *
 * Ce que le bord lit chez les autres (départs, billets, sièges, colis du départ, position du bus) passe par
 * les ports de la billetterie, des colis et du GPS : il ne les recopie pas.
 */

export interface StockageBord {
  readonly durable: boolean;
}

/** Le détail des billets vendus en route par le convoyeur. */
export abstract class VentesEnRoute {
  /** `false` si ce billet y est déjà (événement rejoué). */
  abstract ajouter(vente: VenteRoute): Promise<boolean>;
  abstract duDepart(departId: string): Promise<VenteRoute[]>;
}

/** Scans à un arrêt et arrivées à un arrêt, en ajout seul. */
export abstract class PassagesRoute {
  /** `false` si cet événement y est déjà. */
  abstract ajouter(passage: PassageRoute): Promise<boolean>;
  /** Du plus ancien au plus récent. */
  abstract duDepart(departId: string, genre?: GenrePassage): Promise<PassageRoute[]>;
}

/** Dépenses du trajet saisies par le chauffeur (table `depart_depense` du lot C). */
export abstract class DepensesBord {
  /** `false` si cette dépense existe déjà (identifiant déjà pris). */
  abstract ajouter(depense: DepenseBord): Promise<boolean>;
  /** Toutes les lignes du départ, quelle que soit leur origine, de la plus ancienne à la plus récente. */
  abstract duDepart(departId: string): Promise<DepenseBord[]>;
}

/** Incidents signalés (table `depart_incident` du lot C). */
export abstract class IncidentsBord {
  /** `false` si cet incident existe déjà (identifiant déjà pris). */
  abstract ajouter(incident: IncidentBord): Promise<boolean>;
  abstract duDepart(departId: string): Promise<IncidentBord[]>;
}

/** Le retard annoncé d'un départ (table `depart_observation` du lot C). */
export abstract class RetardsDepart {
  /** Pose le retard annoncé ; la note de l'observation, si elle existe, est conservée. */
  abstract noter(departId: string, minutes: number, at: string): Promise<void>;
  abstract lire(departId: string): Promise<RetardDepart | null>;
}

export type ResultatOuverture = { controle: ControleStocke; cree: boolean };

/** Les contrôles inopinés à bord et tout ce qui s'y rattache. */
export abstract class ControlesBord {
  abstract trouver(id: string): Promise<ControleStocke | null>;
  /** Le contrôle ouvert de ce contrôleur, s'il en a un (un seul à la fois). */
  abstract ouvertDe(controleurId: string): Promise<ControleStocke | null>;
  /**
   * Ouvre le contrôle. Si le contrôleur en a déjà un d'ouvert (deux ouvertures simultanées), renvoie
   * celui-là avec `cree: false` : jamais deux contrôles ouverts pour la même personne.
   */
  abstract ouvrir(controle: ControleStocke): Promise<ResultatOuverture>;
  abstract constats(controleId: string): Promise<SiegeConstate[]>;
  /** Pose ou remplace le constat d'un siège. */
  abstract constater(
    controleId: string,
    siege: number,
    constat: ConstatSiege,
    at: string,
  ): Promise<void>;
  /** `false` si ce billet est déjà une régularisation. */
  abstract regulariser(regularisation: RegularisationControle): Promise<boolean>;
  abstract regularisations(controleId: string): Promise<RegularisationControle[]>;
  /** `false` si ce signalement (même événement) existe déjà. */
  abstract signaler(signalement: SignalementConvoyeur): Promise<boolean>;
  abstract signalements(controleId: string): Promise<SignalementConvoyeur[]>;
  abstract marquerPatronPrevenu(evenementId: string): Promise<void>;
  /**
   * Clôt le contrôle en figeant les trois comptes. `null` si le contrôle était déjà clos (comparer et
   * remplacer sur `clotureA`).
   */
  abstract clore(
    id: string,
    a: { clotureA: string; liste: number; tetes: number; ecart: number },
  ): Promise<ControleStocke | null>;
  /** Note que le constat est parti au patron (après la clôture). */
  abstract marquerEnvoye(id: string): Promise<void>;
  abstract duDepart(departId: string): Promise<ControleStocke[]>;
}

/* ------------------------------------------------------------------ messages (SMS) */

export interface DemandeSmsBilletBord {
  billetId: string;
  numero: string;
  telephone: string;
  compagnie: string;
  compagnieId: string;
  origine: string;
  destination: string;
  departA: string;
  siege: number | null;
  code: string;
  convoyeurId: string;
}

export interface DemandeRetard {
  /** Clé d'idempotence de l'événement : le même retard ne produit jamais deux SMS au même numéro. */
  evenementId: string;
  compagnieId: string;
  gareId: string | null;
  compagnie: string;
  immatriculation: string;
  origine: string;
  destination: string;
  departA: string;
  arriveeEstimeeA: string;
  minutes: number;
  /** Un billet par voyageur à bord joignable. */
  voyageurs: { billetId: string; telephone: string }[];
}

export interface DemandeIncident {
  evenementId: string;
  compagnieId: string;
  gareId: string | null;
  compagnie: string;
  origine: string;
  destination: string;
  departA: string;
  immatriculation: string;
  libelleNature: string;
  voyageurs: { billetId: string; telephone: string }[];
}

export interface DemandeConstat {
  compagnieId: string;
  gareId: string | null;
  texte: string;
}

/**
 * Les messages que le bord envoie : le billet vendu en route, le retard et l'incident (aux voyageurs et à la
 * gare), le constat d'un contrôle (au patron). Une panne de SMS est notée, jamais propagée : l'événement du
 * terrain est enregistré quoi qu'il arrive.
 */
export abstract class MessagesBord {
  /** `true` si le SMS est parti (ou mis en file). */
  abstract envoyerBillet(d: DemandeSmsBilletBord): Promise<boolean>;
  /** Voyageurs prévenus et la gare (superviseurs) prévenue ou non. */
  abstract prevenirRetard(d: DemandeRetard): Promise<{ voyageurs: number; gare: boolean }>;
  /** Voyageurs prévenus et la gare (superviseurs) prévenue ou non. */
  abstract prevenirIncident(d: DemandeIncident): Promise<{ voyageurs: number; gare: boolean }>;
  /** `true` si au moins un responsable (patron) a reçu le message. */
  abstract prevenirPatron(d: DemandeConstat): Promise<boolean>;
}
