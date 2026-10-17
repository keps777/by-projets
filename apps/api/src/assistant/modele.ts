import type { ActionProposee, SourceDonnee, TypeAction } from "../analyses/modele";

/**
 * Formes que l'assistant lit, stocke et rend. Les formes rendues (`*Vue`) sont exactement celles des
 * contrats patron (`packages/contrats/src/patron/assistant.ts`) : les tests les valident avec les
 * schémas zod du contrat.
 */

/** Ce que le patron veut savoir, après interprétation de sa question. */
export type Intention =
  | "pourquoi_ligne"
  | "cout_bus"
  | "prevision_jour"
  | "et_si_prix"
  | "ou_part_argent"
  /** Plusieurs lignes correspondent : l'assistant demande laquelle. */
  | "ambigue"
  | "inconnue";

/** Qui a écrit le texte de la réponse : les règles de l'API, ou le modèle de langage (chiffres vérifiés). */
export type Redaction = "regles" | "modele";

/* ------------------------------------------------------------------ formes rendues (contrat) */

export interface ActionVue {
  id: string;
  libelle: string;
  type: TypeAction;
  /** La ligne de « Voir la ligne » et « Ajouter un départ » (les autres actions n'en portent pas). */
  ligneId?: string;
}

/** Le graphique d'un diagnostic : le remplissage de chaque jour de la période, le plus ancien d'abord. */
export interface GraphiqueVue {
  valeurs: number[];
  /** Rangs (1 = le plus ancien) des jours en écart. */
  joursEnEcart: number[];
}

export interface ScenarioVue {
  libelle: string;
  remplis: number;
  capacite: number;
}

export interface SimulationVue {
  scenarios: ScenarioVue[];
  gainMensuel: number;
}

export interface FuiteVue {
  id: string;
  periodeJours: number;
  constat: string;
  explication: string;
  montantTotal: number | null;
  joursConcernes: number[];
  actions: ActionVue[];
}

export interface GainVue {
  id: string;
  constat: string;
  simulation: SimulationVue;
  base: string;
  action: ActionVue;
}

export interface InsightsVue {
  fuites: FuiteVue[];
  gains: GainVue[];
  questionsSuggerees: string[];
}

export interface OptionSimuleeVue {
  libelle: string;
  gainMensuel: number;
}

export interface ReponseVue {
  question: string;
  repondueA: string;
  dureeSecondes: number;
  resume: string;
  points: string[];
  actions: ActionVue[];
  sources: string | null;
  simulation: { options: OptionSimuleeVue[] } | null;
  graphique?: GraphiqueVue;
}

export interface ConversationVue {
  id: string;
  baseJours: number;
  echanges: ReponseVue[];
}

export type DemandeSimulationVue =
  | { type: "horaire"; departId: string; nouvelleHeure: string }
  | { type: "prix"; departId: string; nouveauPrix: number };

export interface ResultatSimulationVue {
  demande: DemandeSimulationVue;
  simulation: SimulationVue;
  base: string;
}

export interface PropositionAppliqueeVue {
  journalId: string;
  signeA: string;
  signePar: string;
  actionId: string;
  effetA: string;
}

/* ------------------------------------------------------------------ ce qui est stocké */

/** Ce dont une question de suivi (« et si je baisse à 3 500 ? ») a besoin de la question d'avant. */
export interface ContexteConversation {
  ligneId: string | null;
  /** Le dernier départ de la série dont on parlait. */
  departId: string | null;
}

/** `assistant_echange` : une question du patron et la réponse qu'il a reçue. */
export interface EchangeStocke {
  id: string;
  compagnieId: string;
  utilisateurId: string;
  intention: Intention;
  redaction: Redaction;
  reponse: ReponseVue;
  contexte: ContexteConversation;
  creeLe: string;
}

export interface ApplicationProposition {
  par: string;
  a: string;
  /** Renseigné à la fin de l'application : la ligne du journal d'audit. */
  journalId: string | null;
  effetA: string | null;
}

/** `assistant_proposition` : ce que l'API a proposé au patron, et ce qu'il en a fait. */
export interface PropositionStockee {
  compagnieId: string;
  action: ActionProposee;
  proposeeLe: string;
  expireLe: string;
  application: ApplicationProposition | null;
}

/* ------------------------------------------------------------------ brouillon d'une réponse */

/**
 * Une réponse calculée par le moteur, avant mise en forme. Les chiffres viennent des calculs de
 * `analyses` ; le texte est celui des règles. Le modèle de langage, s'il y en a un, ne peut que le
 * reformuler à partir de `faits`.
 */
export interface Brouillon {
  intention: Intention;
  resume: string;
  points: string[];
  actions: ActionProposee[];
  sources: SourceDonnee[];
  simulation: OptionSimuleeVue[] | null;
  /** Le graphique du diagnostic (« pourquoi cette ligne baisse »). */
  graphique?: GraphiqueVue;
  /** Les phrases chiffrées que le modèle de langage a le droit de reformuler (rien d'autre). */
  faits: string[];
  /** Textes qu'une reformulation doit garder (le nom complet de la ligne, que l'écran retrouve). */
  motsObligatoires: string[];
  contexte: ContexteConversation;
  /** Pas de reformulation : la réponse est une consigne (question ambiguë, inconnue). */
  figee: boolean;
}
